// Package notify is the outbound seller-alert layer. Today it speaks
// WhatsApp via Twilio (platform-funded — one set of creds for the
// whole service, billed to the platform). Designed to fail-silent:
// missing creds, malformed numbers, or Twilio outages NEVER block the
// order-create path that fans out into here.
package notify

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Twilio is a thin HTTPS wrapper around the Twilio "Send a Message"
// endpoint, just enough for our WhatsApp-alert use case. We don't
// import the official Go SDK to keep the dependency footprint small —
// the entire Twilio API surface we use here is one POST.
type Twilio struct {
	accountSID  string
	authToken   string
	whatsAppFrom string // E.164, e.g. "+14155238886"
	http        *http.Client
	logger      *slog.Logger
}

// NewTwilio returns a client. If accountSID, authToken, or whatsAppFrom
// is empty the returned client is a "configured" no-op — every Send
// call logs at INFO and returns nil. This keeps local dev working
// without credentials and prevents an order from failing just because
// production env vars haven't been deployed yet.
func NewTwilio(accountSID, authToken, whatsAppFrom string, logger *slog.Logger) *Twilio {
	return &Twilio{
		accountSID:   strings.TrimSpace(accountSID),
		authToken:    strings.TrimSpace(authToken),
		whatsAppFrom: strings.TrimSpace(whatsAppFrom),
		http:         &http.Client{Timeout: 10 * time.Second},
		logger:       logger,
	}
}

// Configured reports whether all three creds are present. Callers can
// short-circuit composition work when notifications are disabled.
func (t *Twilio) Configured() bool {
	return t.accountSID != "" && t.authToken != "" && t.whatsAppFrom != ""
}

// SendWhatsApp posts a WhatsApp message to `toE164` (E.164 phone, no
// "whatsapp:" prefix — we add it). Returns nil on 2xx, an error on
// any non-2xx. Callers that don't want to block on the result should
// invoke this in a goroutine — see notify.FireAndForget.
func (t *Twilio) SendWhatsApp(ctx context.Context, toE164, body string) error {
	if !t.Configured() {
		t.logger.Info("twilio not configured, skipping wa send",
			"to", redact(toE164))
		return nil
	}
	toE164 = strings.TrimSpace(toE164)
	if toE164 == "" {
		return errors.New("recipient empty")
	}
	if !strings.HasPrefix(toE164, "+") {
		// Best-effort normalize Indonesian numbers stored as 08xxxx —
		// not strictly RFC E.164 but it's what most sellers paste.
		toE164 = normalizeID(toE164)
	}

	form := url.Values{}
	form.Set("From", "whatsapp:"+t.whatsAppFrom)
	form.Set("To", "whatsapp:"+toE164)
	form.Set("Body", body)

	endpoint := "https://api.twilio.com/2010-04-01/Accounts/" +
		url.PathEscape(t.accountSID) + "/Messages.json"

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint,
		strings.NewReader(form.Encode()))
	if err != nil {
		return fmt.Errorf("build twilio request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.SetBasicAuth(t.accountSID, t.authToken)

	resp, err := t.http.Do(req)
	if err != nil {
		return fmt.Errorf("twilio post: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return nil
	}
	// Read up to 1KB of the error body for the log line — Twilio
	// returns JSON with `message` + `code` fields. Truncated to keep
	// the slog event small.
	body1k, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
	return fmt.Errorf("twilio %d: %s", resp.StatusCode, strings.TrimSpace(string(body1k)))
}

// FireAndForget runs SendWhatsApp on a detached background context and
// logs any error. Order-create handlers use this so a slow Twilio API
// can't backpressure the buyer's checkout.
func (t *Twilio) FireAndForget(toE164, body string) {
	if !t.Configured() {
		// Avoid spawning a goroutine just to log nothing useful.
		return
	}
	go func() {
		// Detached context with a hard cap so a stuck Twilio call
		// can't leak goroutines indefinitely.
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		if err := t.SendWhatsApp(ctx, toE164, body); err != nil {
			t.logger.Warn("twilio wa send failed",
				"err", err, "to", redact(toE164))
		}
	}()
}

// redact masks all but the last 4 digits of a phone for log output.
func redact(n string) string {
	n = strings.TrimSpace(n)
	if len(n) <= 4 {
		return "****"
	}
	return strings.Repeat("*", len(n)-4) + n[len(n)-4:]
}

// normalizeID converts common Indonesian phone formats to E.164.
// Examples: "08123456789" → "+628123456789", "628..." → "+628...".
// Leaves anything that doesn't look ID-shaped alone — Twilio will
// reject it and we'll log the failure.
func normalizeID(n string) string {
	n = strings.ReplaceAll(n, " ", "")
	n = strings.ReplaceAll(n, "-", "")
	switch {
	case strings.HasPrefix(n, "0"):
		return "+62" + n[1:]
	case strings.HasPrefix(n, "62"):
		return "+" + n
	default:
		return n
	}
}
