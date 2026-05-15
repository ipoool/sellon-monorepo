// Package email sends transactional mail through the Mailtrap Send
// API (HTTPS POST, not SMTP). The Mailer is safe to share across
// goroutines and never blocks the caller's request: every send runs
// in a fresh goroutine and errors only get logged.
//
// When the API key is empty, Send becomes a no-op — useful for local
// dev without Mailtrap credentials.
package email

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

// Mailtrap's transactional Send API. Per their docs, "send.api.mailtrap.io"
// is the production stream; the same shape works for the sandbox stream
// at "sandbox.api.mailtrap.io/api/send/{inbox_id}". We default to the
// production endpoint — sandbox users can override via env if needed.
const defaultEndpoint = "https://send.api.mailtrap.io/api/send"

type Mailer struct {
	apiKey    string
	endpoint  string
	fromEmail string
	fromName  string
	http      *http.Client
	logger    *slog.Logger
}

func NewMailer(apiKey, fromEmail, fromName string, logger *slog.Logger) *Mailer {
	return &Mailer{
		apiKey:    apiKey,
		endpoint:  defaultEndpoint,
		fromEmail: fromEmail,
		fromName:  fromName,
		http:      &http.Client{Timeout: 15 * time.Second},
		logger:    logger,
	}
}

// WithEndpoint lets callers point at the sandbox/staging URL.
func (m *Mailer) WithEndpoint(url string) *Mailer {
	m.endpoint = url
	return m
}

func (m *Mailer) Configured() bool {
	return m != nil && m.apiKey != "" && m.fromEmail != ""
}

type Message struct {
	To       string
	ToName   string
	Subject  string
	Text     string // plain text — required
	HTML     string // optional HTML alternative
	Category string // optional Mailtrap categorisation tag
	// BCC: list email yang dapat salinan tanpa terlihat di header To.
	// Mailtrap Send API mendukung array `bcc`.
	BCC []string
}

// Send fires the email asynchronously. Errors are logged but never
// returned to the caller — email is best-effort and shouldn't roll
// back the transaction that triggered it.
func (m *Mailer) Send(msg Message) {
	if !m.Configured() {
		return
	}
	if msg.To == "" || msg.Subject == "" || msg.Text == "" {
		m.logger.Warn("email: missing required fields", "to", msg.To, "subject", msg.Subject)
		return
	}
	go func() { _ = m.SendSync(msg) }()
}

// SendSync is the blocking version, used by tests and admin "send test
// email" tools.
func (m *Mailer) SendSync(msg Message) error {
	if !m.Configured() {
		return errors.New("email: Mailtrap API key not configured")
	}
	body, err := json.Marshal(buildPayload(msg, m.fromEmail, m.fromName))
	if err != nil {
		return fmt.Errorf("marshal payload: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, m.endpoint, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("new request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+m.apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := m.http.Do(req)
	if err != nil {
		m.logger.Error("email: send failed",
			"err", err, "to", msg.To, "subject", msg.Subject)
		return fmt.Errorf("post: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		respBody, _ := io.ReadAll(resp.Body)
		m.logger.Error("email: mailtrap rejected",
			"status", resp.StatusCode,
			"body", string(respBody),
			"to", msg.To, "subject", msg.Subject)
		return fmt.Errorf("mailtrap %d: %s", resp.StatusCode, string(respBody))
	}

	m.logger.Info("email: sent", "to", msg.To, "subject", msg.Subject)
	return nil
}

// === Mailtrap payload shape ===

type mailtrapAddress struct {
	Email string `json:"email"`
	Name  string `json:"name,omitempty"`
}

type mailtrapPayload struct {
	From     mailtrapAddress   `json:"from"`
	To       []mailtrapAddress `json:"to"`
	BCC      []mailtrapAddress `json:"bcc,omitempty"`
	Subject  string            `json:"subject"`
	Text     string            `json:"text"`
	HTML     string            `json:"html,omitempty"`
	Category string            `json:"category,omitempty"`
}

func buildPayload(msg Message, fromEmail, fromName string) mailtrapPayload {
	bcc := make([]mailtrapAddress, 0, len(msg.BCC))
	for _, addr := range msg.BCC {
		if addr = strings.TrimSpace(addr); addr != "" {
			bcc = append(bcc, mailtrapAddress{Email: addr})
		}
	}
	return mailtrapPayload{
		From: mailtrapAddress{Email: fromEmail, Name: fromName},
		To: []mailtrapAddress{{
			Email: msg.To,
			Name:  msg.ToName,
		}},
		BCC:      bcc,
		Subject:  msg.Subject,
		Text:     msg.Text,
		HTML:     msg.HTML,
		Category: msg.Category,
	}
}
