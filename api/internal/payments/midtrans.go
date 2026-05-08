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
		// Midtrans returns: { "error_messages": [...], "status_code": "..." }
		return nil, fmt.Errorf("midtrans %d: %s", resp.StatusCode, string(respBody))
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
