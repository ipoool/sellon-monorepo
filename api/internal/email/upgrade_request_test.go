package email

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

// The billing inbox is BCC'd, never To'd. A seller must not see an internal
// address on their own receipt, and the address must not be reachable by
// replying to the message.
func TestUpgradeRequestPutsBillingAddressInBCC(t *testing.T) {
	var got mailtrapPayload
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(body, &got); err != nil {
			t.Errorf("decode payload: %v", err)
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"success":true}`))
	}))
	defer srv.Close()

	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError + 1}))
	m := NewMailer("test-key", "halo@sellon.id", "SellOn", logger).WithEndpoint(srv.URL)

	subject, text, htmlBody := RenderSubscriptionUpgradeRequest(UpgradeRequestData{
		StoreName:   "Warung Bu Sari",
		StoreSlug:   "warung-bu-sari",
		OwnerName:   "Bu Sari",
		OwnerEmail:  "seller@example.com",
		PlanLabel:   "Pro",
		Months:      1,
		AmountCents: 9900000,
		InvoiceID:   "inv-1",
		ProofURL:    "https://api.sellon.id/api/v1/files/s/subscription_proofs/i/a.jpg",
	})
	if err := m.SendSync(Message{
		To:      "seller@example.com",
		BCC:     []string{"billing@example.com"},
		Subject: subject,
		Text:    text,
		HTML:    htmlBody,
	}); err != nil {
		t.Fatalf("send: %v", err)
	}

	if len(got.To) != 1 || got.To[0].Email != "seller@example.com" {
		t.Fatalf("primary recipient should be the seller, got %+v", got.To)
	}
	if len(got.BCC) != 1 || got.BCC[0].Email != "billing@example.com" {
		t.Fatalf("billing address should be BCC'd, got %+v", got.BCC)
	}
	for _, addr := range got.To {
		if addr.Email == "billing@example.com" {
			t.Fatal("internal billing address leaked into the To header")
		}
	}
	// The body is the work item for whoever reads the BCC, so it has to
	// carry enough to act on without opening the dashboard first.
	for _, want := range []string{"Warung Bu Sari", "seller@example.com", "Rp 99.000", "Pro"} {
		if !strings.Contains(got.Text, want) {
			t.Errorf("plain-text body is missing %q", want)
		}
	}
	if !strings.Contains(got.HTML, "Lihat bukti transfer") {
		t.Error("HTML body should link the attached receipt")
	}
}

// No receipt is a valid request (WhatsApp is still a channel), but the email
// has to say so — an admin must not read a missing attachment as "verified".
func TestUpgradeRequestFlagsMissingProof(t *testing.T) {
	_, text, htmlBody := RenderSubscriptionUpgradeRequest(UpgradeRequestData{
		StoreName:   "Toko Uji",
		StoreSlug:   "toko-uji",
		OwnerName:   "Uji",
		OwnerEmail:  "uji@example.com",
		PlanLabel:   "Bisnis",
		Months:      12,
		AmountCents: 29900000,
		InvoiceID:   "inv-2",
	})
	if !strings.Contains(text, "belum dilampirkan") {
		t.Error("plain-text body should say the receipt is missing")
	}
	if !strings.Contains(htmlBody, "Belum dilampirkan") {
		t.Error("HTML body should say the receipt is missing")
	}
	if strings.Contains(htmlBody, "Lihat bukti transfer") {
		t.Error("HTML body links a receipt that was never attached")
	}
}
