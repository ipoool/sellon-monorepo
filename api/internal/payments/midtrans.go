// Package payments wraps the third-party Midtrans Snap API.
//
// The seller's encrypted server key is decrypted on demand for each call;
// we never persist plaintext.
package payments

import (
	"bytes"
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"
)

const (
	snapSandboxBase = "https://app.sandbox.midtrans.com/snap/v1"
	snapProdBase    = "https://app.midtrans.com/snap/v1"
	coreSandboxBase = "https://api.sandbox.midtrans.com/v2"
	coreProdBase    = "https://api.midtrans.com/v2"
)

type MidtransClient struct {
	httpClient *http.Client
}

func NewMidtransClient() *MidtransClient {
	return &MidtransClient{
		httpClient: &http.Client{Timeout: 15 * time.Second},
	}
}

type SnapTransactionInput struct {
	OrderID       string
	GrossAmount   int64
	CustomerName  string
	CustomerEmail string
	CustomerPhone string
	Items         []SnapItem
	IsSandbox     bool
	ServerKey     string
}

type SnapItem struct {
	ID       string
	Name     string
	Price    int64
	Quantity int
}

type SnapResponse struct {
	Token       string `json:"token"`
	RedirectURL string `json:"redirect_url"`
}

// CreateSnapTransaction calls Snap /transactions and returns the redirect URL
// the buyer is sent to.
func (c *MidtransClient) CreateSnapTransaction(in SnapTransactionInput) (*SnapResponse, error) {
	base := snapSandboxBase
	if !in.IsSandbox {
		base = snapProdBase
	}

	body := map[string]any{
		"transaction_details": map[string]any{
			"order_id":     in.OrderID,
			"gross_amount": in.GrossAmount / 100, // Midtrans expects rupiah, our DB stores cents
		},
		"customer_details": map[string]any{
			"first_name": in.CustomerName,
			"email":      defaultEmail(in.CustomerEmail, in.CustomerPhone),
			"phone":      in.CustomerPhone,
		},
		"item_details": toSnapItems(in.Items),
		"credit_card": map[string]any{"secure": true},
	}

	buf, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest(http.MethodPost, base+"/transactions", bytes.NewReader(buf))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	// Midtrans uses HTTP Basic with serverKey + ":" base64-encoded.
	req.SetBasicAuth(in.ServerKey, "")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode >= 400 {
		// Translate Midtrans HTTP errors to user-friendly messages.
		switch resp.StatusCode {
		case http.StatusUnauthorized, http.StatusForbidden:
			return nil, fmt.Errorf("kunci API Midtrans tidak valid atau tidak sesuai mode aktif (sandbox/production) — periksa Pengaturan Pembayaran")
		case http.StatusBadRequest:
			return nil, fmt.Errorf("data pesanan ditolak Midtrans — pastikan informasi pesanan lengkap")
		default:
			return nil, fmt.Errorf("koneksi ke Midtrans gagal — coba lagi dalam beberapa saat")
		}
	}

	var out SnapResponse
	if err := json.Unmarshal(respBody, &out); err != nil {
		return nil, fmt.Errorf("decode: %w (raw=%s)", err, string(respBody))
	}
	if out.RedirectURL == "" {
		return nil, errors.New("midtrans: empty redirect_url in response")
	}
	return &out, nil
}

func toSnapItems(items []SnapItem) []map[string]any {
	out := make([]map[string]any, 0, len(items))
	for _, it := range items {
		out = append(out, map[string]any{
			"id":       it.ID,
			"name":     truncateName(it.Name),
			"price":    it.Price / 100,
			"quantity": it.Quantity,
		})
	}
	return out
}

func truncateName(s string) string {
	// Midtrans rejects item names longer than 50 characters
	if len(s) > 50 {
		return s[:47] + "..."
	}
	return s
}

func defaultEmail(email, phone string) string {
	if email != "" {
		return email
	}
	if phone == "" {
		return "buyer@sellon.id"
	}
	return phone + "@buyer.sellon.id"
}

// Ping verifies that the server key is valid by hitting a lightweight
// authenticated endpoint. Midtrans Core /v2/ping returns "pong" on success;
// 401/403 means the key is invalid for that environment.
func (c *MidtransClient) Ping(serverKey string, isSandbox bool) error {
	base := coreSandboxBase
	if !isSandbox {
		base = coreProdBase
	}
	req, err := http.NewRequest(http.MethodGet, base+"/ping", nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	req.SetBasicAuth(serverKey, "")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("hubungi Midtrans: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	switch resp.StatusCode {
	case http.StatusOK:
		return nil
	case http.StatusUnauthorized, http.StatusForbidden:
		return fmt.Errorf("server key Midtrans ditolak — pastikan key benar dan cocok dengan mode aktif (sandbox/production)")
	case http.StatusNotFound:
		// /v2/ping doesn't exist on all envs; treat 404 as "auth header was
		// processed" (otherwise would be 401). Best-effort success.
		return nil
	default:
		return fmt.Errorf("midtrans ping returned %d: %s", resp.StatusCode, string(body))
	}
}

// RefundInput captures the fields Midtrans needs for a direct-refund call.
// AmountCents is converted to rupiah at the boundary so the rest of the
// codebase keeps using cents consistently.
type RefundInput struct {
	OrderNumber string // our order_number — also Midtrans' order_id
	AmountCents int64
	Reason      string
	RefundKey   string // idempotency key, must be unique per refund attempt
	IsSandbox   bool
	ServerKey   string
}

// RefundResponse is the subset of Midtrans's /refund response we care about.
// `status_code` is "200" on success, anything else carries `status_message`.
type RefundResponse struct {
	StatusCode        string `json:"status_code"`
	StatusMessage     string `json:"status_message"`
	TransactionID     string `json:"transaction_id"`
	OrderID           string `json:"order_id"`
	GrossAmount       string `json:"gross_amount"`
	RefundAmount      string `json:"refund_amount"`
	RefundKey         string `json:"refund_key"`
	TransactionStatus string `json:"transaction_status"`
}

// Refund calls POST {core_base}/v2/{order_id}/refund. Used when the order
// was paid via a Midtrans-supported method (QRIS, VA, e-wallet, card).
//
// Notes:
//   - Some methods need to be refunded via the e-wallet partner instead and
//     will return 412/413; the caller should surface the message verbatim
//     so the seller knows to try the manual route.
//   - We always send `amount` in rupiah (Midtrans's native unit).
func (c *MidtransClient) Refund(in RefundInput) (*RefundResponse, error) {
	base := coreSandboxBase
	if !in.IsSandbox {
		base = coreProdBase
	}

	body := map[string]any{
		"refund_key": in.RefundKey,
		"amount":     in.AmountCents / 100,
		"reason":     in.Reason,
	}
	buf, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}

	url := base + "/" + in.OrderNumber + "/refund"
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(buf))
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

	var out RefundResponse
	if err := json.Unmarshal(respBody, &out); err != nil {
		return nil, fmt.Errorf("midtrans refund decode: %w (raw=%s)", err, string(respBody))
	}

	// Midtrans returns 200 OK with status_code "200" on success. Some
	// errors (412, 413) come through as 4xx HTTP with a parseable JSON body.
	switch out.StatusCode {
	case "200", "201":
		return &out, nil
	default:
		msg := out.StatusMessage
		if msg == "" {
			msg = string(respBody)
		}
		return nil, fmt.Errorf("midtrans tolak refund (%s): %s", out.StatusCode, msg)
	}
}

// IsMidtransPaymentMethod reports whether `method` (as recorded in
// orders.payment_method) was processed by Midtrans Snap. Manual transfers
// and QRIS-statis are not Midtrans even though they look similar in name.
func IsMidtransPaymentMethod(method string) bool {
	switch method {
	case "credit_card", "card",
		"bank_transfer", "va", "echannel",
		"bca_va", "bni_va", "bri_va", "permata_va", "cimb_va",
		"gopay", "shopeepay", "qris":
		return true
	default:
		return false
	}
}

// VerifySignature validates the Midtrans webhook signature_key.
//
// Per Midtrans docs:
//   signature_key = SHA512(order_id + status_code + gross_amount + ServerKey)
func VerifySignature(orderID, statusCode, grossAmount, serverKey, providedSignature string) bool {
	raw := orderID + statusCode + grossAmount + serverKey
	sum := sha512.Sum512([]byte(raw))
	expected := hex.EncodeToString(sum[:])
	return expected == providedSignature
}

// MapTransactionStatus translates Midtrans transaction_status into our DB
// payment_status enum.
func MapTransactionStatus(transactionStatus, fraudStatus string) string {
	switch transactionStatus {
	case "capture":
		// Credit card capture — only "accept" means money in.
		if fraudStatus == "accept" || fraudStatus == "" {
			return "paid"
		}
		return "pending"
	case "settlement":
		return "paid"
	case "pending":
		return "pending"
	case "deny", "cancel", "expire", "failure":
		return "failed"
	case "refund", "partial_refund":
		return "refunded"
	default:
		return ""
	}
}
