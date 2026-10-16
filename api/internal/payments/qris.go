package payments

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Dynamic QRIS via the Midtrans Core API.
//
// This is deliberately NOT Snap. Snap returns a redirect URL, and a QR holding
// that URL is not a QRIS payment code — scanning it with a banking app opens a
// browser instead of paying. An unattended booth needs an EMV payload with the
// amount already locked in, which only Core API `/charge` produces.
//
// The seller-facing flows keep using Snap; this path exists for the platform's
// own kiosk-style products (PhotoBoost), charged on the platform account.

// jakarta is where Midtrans reports transaction and expiry times. The API
// sends "2026-10-16 12:34:56" with no zone, so it has to be supplied.
var jakarta = func() *time.Location {
	loc, err := time.LoadLocation("Asia/Jakarta")
	if err != nil {
		// Fixed offset fallback for containers without tzdata. WIB has no DST,
		// so this is exact rather than approximate.
		return time.FixedZone("WIB", 7*60*60)
	}
	return loc
}()

type QRISChargeInput struct {
	// OrderID must be unique forever: Midtrans rejects a second charge on an
	// order_id it has already seen.
	OrderID     string
	GrossAmount int64 // cents; divided by 100 at the Midtrans boundary
	ItemID      string
	ItemName    string
	// ExpiryMinutes bounds how long the QR stays payable. Defaults to 10.
	ExpiryMinutes int
	ServerKey     string
}

// QRISAction is one of the follow-up URLs Midtrans returns. The one that
// matters is named "generate-qr-code".
type QRISAction struct {
	Name   string `json:"name"`
	Method string `json:"method"`
	URL    string `json:"url"`
}

type QRISChargeResponse struct {
	StatusCode        string       `json:"status_code"`
	StatusMessage     string       `json:"status_message"`
	TransactionID     string       `json:"transaction_id"`
	OrderID           string       `json:"order_id"`
	GrossAmount       string       `json:"gross_amount"`
	PaymentType       string       `json:"payment_type"`
	TransactionStatus string       `json:"transaction_status"`
	FraudStatus       string       `json:"fraud_status"`
	TransactionTime   string       `json:"transaction_time"`
	ExpiryTime        string       `json:"expiry_time"`
	Acquirer          string       `json:"acquirer"`
	QRString          string       `json:"qr_string"`
	Actions           []QRISAction `json:"actions"`
}

// QRCodeURL returns the hosted QR image URL, or "" when Midtrans did not send
// one. Callers should persist this alongside QRString and prefer rendering the
// string locally — a booth with a flaky route to the CDN must still show a QR.
func (r *QRISChargeResponse) QRCodeURL() string {
	for _, a := range r.Actions {
		if a.Name == "generate-qr-code" {
			return a.URL
		}
	}
	return ""
}

// ParsedExpiry converts Midtrans's zone-less expiry_time into a real instant.
// Reports false when the field is absent or unparseable, so the caller can
// fall back to its own deadline rather than treat the QR as already expired.
func (r *QRISChargeResponse) ParsedExpiry() (time.Time, bool) {
	if r.ExpiryTime == "" {
		return time.Time{}, false
	}
	t, err := time.ParseInLocation("2006-01-02 15:04:05", r.ExpiryTime, jakarta)
	if err != nil {
		return time.Time{}, false
	}
	return t, true
}

// ChargeQRIS creates a dynamic QRIS charge and returns the payload to display.
//
// On success Midtrans answers status_code "201" with transaction_status
// "pending" — the money has not moved yet; settlement arrives by webhook (or
// by GetTransactionStatus when a webhook is lost).
func (c *MidtransClient) ChargeQRIS(in QRISChargeInput) (*QRISChargeResponse, error) {
	if in.ServerKey == "" {
		return nil, fmt.Errorf("midtrans server key kosong")
	}
	if in.OrderID == "" {
		return nil, fmt.Errorf("order id kosong")
	}
	expiry := in.ExpiryMinutes
	if expiry <= 0 {
		expiry = 10
	}
	rupiah := in.GrossAmount / 100
	itemID := in.ItemID
	if itemID == "" {
		itemID = "item"
	}
	itemName := truncateName(in.ItemName)
	if itemName == "" {
		itemName = "Pembayaran"
	}

	// No "acquirer" is specified on purpose: letting Midtrans pick keeps the
	// code generic QRIS, payable by any Indonesian wallet or banking app.
	body := map[string]any{
		"payment_type": "qris",
		"transaction_details": map[string]any{
			"order_id":     in.OrderID,
			"gross_amount": rupiah,
		},
		"item_details": []map[string]any{{
			"id":       itemID,
			"name":     itemName,
			"price":    rupiah,
			"quantity": 1,
		}},
		"custom_expiry": map[string]any{
			"expiry_duration": expiry,
			"unit":            "minute",
		},
	}
	buf, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest(http.MethodPost, coreBase+"/charge", bytes.NewReader(buf))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.SetBasicAuth(in.ServerKey, "")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("hubungi Midtrans: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)

	var out QRISChargeResponse
	if err := json.Unmarshal(respBody, &out); err != nil {
		return nil, fmt.Errorf("midtrans qris decode: %w (raw=%s)", err, string(respBody))
	}

	switch out.StatusCode {
	case "200", "201":
		return &out, nil
	default:
		msg := out.StatusMessage
		if msg == "" {
			msg = string(respBody)
		}
		return nil, fmt.Errorf("midtrans tolak charge qris (%s): %s", out.StatusCode, msg)
	}
}

// GetTransactionStatus asks Midtrans what really happened to an order.
//
// This is the safety net for an unattended booth: a dropped webhook would
// otherwise leave a customer who paid with nothing to show for it, and no one
// standing there to notice. Callers throttle it — see the session poll handler.
//
// A 404 ("Transaction doesn't exist") comes back as an error, which is the
// correct reading for a charge we believe we created.
func (c *MidtransClient) GetTransactionStatus(orderID, serverKey string) (*QRISChargeResponse, error) {
	if serverKey == "" {
		return nil, fmt.Errorf("midtrans server key kosong")
	}
	req, err := http.NewRequest(http.MethodGet, coreBase+"/"+orderID+"/status", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.SetBasicAuth(serverKey, "")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("hubungi Midtrans: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)

	var out QRISChargeResponse
	if err := json.Unmarshal(respBody, &out); err != nil {
		return nil, fmt.Errorf("midtrans status decode: %w (raw=%s)", err, string(respBody))
	}
	switch out.StatusCode {
	case "200", "201", "407": // 407 = expired transaction, still a real answer
		return &out, nil
	default:
		msg := out.StatusMessage
		if msg == "" {
			msg = string(respBody)
		}
		return nil, fmt.Errorf("midtrans status (%s): %s", out.StatusCode, msg)
	}
}

// jsonUnmarshalStrict is a test seam: it decodes the same way ChargeQRIS does,
// so the fixture test exercises the real field mapping.
func jsonUnmarshalStrict(raw string, v any) error {
	return json.Unmarshal([]byte(raw), v)
}
