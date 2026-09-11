package handler

// Integration test for platform (subscription) billing amount integrity,
// against a real Postgres. Skipped unless TEST_DATABASE_URL is set.
//
//   TEST_DATABASE_URL='postgres://sellon:sellon@localhost:55433/sellon_test' \
//     go test ./internal/handler/ -run PlatformWebhook -v

import (
	"bytes"
	"context"
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/sellon/sellon/api/internal/audit"
	"github.com/sellon/sellon/api/internal/repository"
)

const testServerKey = "SB-Mid-server-testkey"

func midtransSignature(orderID, statusCode, grossAmount string) string {
	sum := sha512.Sum512([]byte(orderID + statusCode + grossAmount + testServerKey))
	return hex.EncodeToString(sum[:])
}

// seedCheckoutInvoice creates the user → store → subscription → pending
// invoice chain a settlement notification needs.
func seedCheckoutInvoice(t *testing.T, pool *pgxpool.Pool, amountCents int64) (*repository.SubscriptionInvoice, *repository.SubscriptionRepo) {
	t.Helper()
	ctx := context.Background()
	sfx := adminRandSuffix()

	var userID, storeID uuid.UUID
	if err := pool.QueryRow(ctx,
		`INSERT INTO users (email, name) VALUES ($1, 'Seller') RETURNING id`,
		"sub-"+sfx+"@example.com").Scan(&userID); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	if err := pool.QueryRow(ctx,
		`INSERT INTO stores (owner_id, slug, name) VALUES ($1, $2, 'Sub Store') RETURNING id`,
		userID, "sub-"+sfx).Scan(&storeID); err != nil {
		t.Fatalf("seed store: %v", err)
	}

	subs := repository.NewSubscriptionRepo(pool)
	sub, err := subs.GetOrCreate(ctx, storeID)
	if err != nil {
		t.Fatalf("seed subscription: %v", err)
	}
	inv, err := subs.CreateCheckoutInvoice(ctx, storeID, sub.ID, amountCents,
		"midtrans_snap", "SUB-"+sfx, "pro", 1, "test fixture")
	if err != nil {
		t.Fatalf("seed invoice: %v", err)
	}
	return inv, subs
}

func postNotification(t *testing.T, h *PlatformWebhookHandler, body map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	raw, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/webhooks/platform/midtrans", bytes.NewReader(raw))
	rec := httptest.NewRecorder()
	h.Handle(rec, req)
	return rec
}

// A settlement whose amount does not match the invoice must not buy a plan
// period. The signature covers gross_amount, so this is not about forgery —
// it is about a transaction whose amount drifted from the invoice.
func TestPlatformWebhookRefusesAmountMismatch(t *testing.T) {
	pool := adminTestPool(t)
	defer pool.Close()
	ctx := context.Background()

	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError + 1}))
	inv, subs := seedCheckoutInvoice(t, pool, 9900000) // Rp 99.000
	h := NewPlatformWebhookHandler(subs, testServerKey, audit.New(repository.NewAuditRepo(pool), repository.NewUserRepo(pool), logger), logger)

	// Midtrans reports Rp 1.000 against a Rp 99.000 invoice.
	body := map[string]string{
		"order_id":           inv.ProviderOrderID,
		"status_code":        "200",
		"gross_amount":       "1000.00",
		"transaction_status": "settlement",
		"fraud_status":       "accept",
		"signature_key":      midtransSignature(inv.ProviderOrderID, "200", "1000.00"),
	}
	rec := postNotification(t, h, body)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200 ack, got %d: %s", rec.Code, rec.Body.String())
	}

	var status string
	if err := pool.QueryRow(ctx,
		`SELECT status FROM subscription_invoices WHERE id = $1`, inv.ID).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "pending" {
		t.Fatalf("invoice status after a short payment: got %q, want pending", status)
	}

	var plan string
	if err := pool.QueryRow(ctx,
		`SELECT plan FROM subscriptions WHERE id = $1`, inv.SubscriptionID).Scan(&plan); err != nil {
		t.Fatal(err)
	}
	if plan != "free" {
		t.Fatalf("a Rp 1.000 payment bought the %q plan", plan)
	}
}

// The matching amount still settles — the guard must not break billing.
func TestPlatformWebhookSettlesMatchingAmount(t *testing.T) {
	pool := adminTestPool(t)
	defer pool.Close()
	ctx := context.Background()

	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError + 1}))
	inv, subs := seedCheckoutInvoice(t, pool, 9900000)
	h := NewPlatformWebhookHandler(subs, testServerKey, audit.New(repository.NewAuditRepo(pool), repository.NewUserRepo(pool), logger), logger)

	body := map[string]string{
		"order_id":           inv.ProviderOrderID,
		"status_code":        "200",
		"gross_amount":       "99000.00",
		"transaction_status": "settlement",
		"fraud_status":       "accept",
		"signature_key":      midtransSignature(inv.ProviderOrderID, "200", "99000.00"),
	}
	if rec := postNotification(t, h, body); rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var status, plan string
	if err := pool.QueryRow(ctx,
		`SELECT status FROM subscription_invoices WHERE id = $1`, inv.ID).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "paid" {
		t.Fatalf("invoice status: got %q, want paid", status)
	}
	if err := pool.QueryRow(ctx,
		`SELECT plan FROM subscriptions WHERE id = $1`, inv.SubscriptionID).Scan(&plan); err != nil {
		t.Fatal(err)
	}
	if plan != "pro" {
		t.Fatalf("plan after settlement: got %q, want pro", plan)
	}
}
