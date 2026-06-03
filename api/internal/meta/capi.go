// Package meta provides a minimal raw-HTTP client for the Meta (Facebook)
// Conversions API (CAPI). We send a server-side "Purchase" event the moment an
// order is paid, so Meta can attribute the sale to a Facebook/Instagram ad and
// report per-product conversions in Ads/Commerce Manager. Browser Pixel sends
// the same event with the same event_id; Meta deduplicates the pair.
package meta

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

// graphVersion is pinned; bump deliberately when adopting newer CAPI fields.
const graphVersion = "v21.0"

// Client posts conversion events to the Graph API. Safe to share across
// goroutines (stateless HTTP client). It holds no per-seller secrets — the
// pixel id + access token are passed per call from the store's config.
type Client struct {
	http   *http.Client
	logger *slog.Logger
}

func NewClient(logger *slog.Logger) *Client {
	return &Client{
		http:   &http.Client{Timeout: 15 * time.Second},
		logger: logger,
	}
}

// Content is one purchased line item (matches a catalog item by id).
type Content struct {
	ID        string  `json:"id"`
	Quantity  int     `json:"quantity"`
	ItemPrice float64 `json:"item_price"`
}

// PurchaseEvent is the data needed to emit a server-side Purchase.
type PurchaseEvent struct {
	PixelID       string
	AccessToken   string
	TestEventCode string // optional; routes to Events Manager → Test Events

	EventID        string // dedupe key shared with the browser Pixel (order_number)
	EventTime      int64  // unix seconds
	EventSourceURL string

	// Raw PII — hashed here before sending (never sent in clear).
	Email string
	Phone string
	// Meta browser identifiers captured at checkout (improve match quality).
	FBP       string
	FBC       string
	ClientIP  string
	UserAgent string

	Currency string // e.g. "IDR"
	Value    float64
	Contents []Content
}

// SendPurchase fires the Purchase event. Best-effort: returns an error for
// logging but callers run it in a goroutine and never block the user on it.
func (c *Client) SendPurchase(ctx context.Context, ev PurchaseEvent) error {
	if strings.TrimSpace(ev.PixelID) == "" || strings.TrimSpace(ev.AccessToken) == "" {
		return fmt.Errorf("meta capi: pixel id or access token missing")
	}

	userData := map[string]any{}
	if h := hashEmail(ev.Email); h != "" {
		userData["em"] = []string{h}
	}
	if h := hashPhone(ev.Phone); h != "" {
		userData["ph"] = []string{h}
	}
	if ev.FBP != "" {
		userData["fbp"] = ev.FBP
	}
	if ev.FBC != "" {
		userData["fbc"] = ev.FBC
	}
	if ev.ClientIP != "" {
		userData["client_ip_address"] = ev.ClientIP
	}
	if ev.UserAgent != "" {
		userData["client_user_agent"] = ev.UserAgent
	}

	contents := make([]map[string]any, 0, len(ev.Contents))
	contentIDs := make([]string, 0, len(ev.Contents))
	for _, ct := range ev.Contents {
		contents = append(contents, map[string]any{
			"id":         ct.ID,
			"quantity":   ct.Quantity,
			"item_price": ct.ItemPrice,
		})
		contentIDs = append(contentIDs, ct.ID)
	}

	event := map[string]any{
		"event_name":    "Purchase",
		"event_time":    ev.EventTime,
		"event_id":      ev.EventID,
		"action_source": "website",
		"user_data":     userData,
		"custom_data": map[string]any{
			"currency":     ev.Currency,
			"value":        ev.Value,
			"order_id":     ev.EventID,
			"content_type": "product",
			"content_ids":  contentIDs,
			"contents":     contents,
		},
	}
	if ev.EventSourceURL != "" {
		event["event_source_url"] = ev.EventSourceURL
	}

	// access_token goes in the POST body, NOT the query string — a transport
	// error from net/http embeds the full request URL in its message, which
	// would leak the token into logs. The body is never logged.
	payload := map[string]any{
		"data":         []any{event},
		"access_token": ev.AccessToken,
	}
	if ev.TestEventCode != "" {
		payload["test_event_code"] = ev.TestEventCode
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	url := fmt.Sprintf("https://graph.facebook.com/%s/%s/events", graphVersion, ev.PixelID)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("meta capi request: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if resp.StatusCode >= 300 {
		return fmt.Errorf("meta capi status %d: %s", resp.StatusCode, string(respBody))
	}
	return nil
}

// hashEmail lowercases + trims then SHA-256 hex (Meta's required normalization).
func hashEmail(s string) string {
	s = strings.TrimSpace(strings.ToLower(s))
	if s == "" {
		return ""
	}
	return sha256hex(s)
}

// hashPhone strips non-digits then SHA-256 hex. Meta expects digits only,
// country code included (we store Indonesian numbers; leave as the seller has them).
func hashPhone(s string) string {
	var b strings.Builder
	for _, r := range s {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	if b.Len() == 0 {
		return ""
	}
	return sha256hex(b.String())
}

func sha256hex(s string) string {
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:])
}
