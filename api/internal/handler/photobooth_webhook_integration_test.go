package handler

// The PhotoBoost branch of the platform webhook, against a real Postgres.
// Skipped unless TEST_DATABASE_URL is set.
//
//   TEST_DATABASE_URL='postgres://sellon:sellon@localhost:55432/sellon_test?sslmode=disable' \
//     go test ./internal/handler/ -run PhotoBoothWebhook -v

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/sellon/sellon/api/internal/audit"
	"github.com/sellon/sellon/api/internal/repository"
)

func pbWebhookHandler(t *testing.T, pool *pgxpool.Pool) (*PlatformWebhookHandler, *repository.PhotoBoothSessionRepo) {
	t.Helper()
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError + 1}))
	sessions := repository.NewPhotoBoothSessionRepo(pool)
	h := NewPlatformWebhookHandler(
		repository.NewSubscriptionRepo(pool), sessions, testServerKey,
		audit.New(repository.NewAuditRepo(pool), repository.NewUserRepo(pool), logger), logger,
	)
	return h, sessions
}

// seedChargedSession builds a booth + a session that has already been charged,
// which is the only state a real notification can arrive for.
func seedChargedSession(t *testing.T, pool *pgxpool.Pool, amountCents int64) (*repository.PhotoBoothSession, *repository.PhotoBoothSessionRepo) {
	t.Helper()
	ctx := context.Background()
	booths := repository.NewPhotoBoothRepo(pool)
	sessions := repository.NewPhotoBoothSessionRepo(pool)

	code := fmt.Sprintf("W%05d", uuid.New().ID()%100000)
	b, err := booths.CreateBooth(ctx, repository.CreateBoothInput{Code: code, Name: "Webhook " + code})
	if err != nil {
		t.Fatalf("create booth: %v", err)
	}
	s, _, err := sessions.CreateSession(ctx, repository.CreateSessionInput{
		BoothID: b.ID, BoothCode: b.Code, IdempotencyKey: uuid.NewString(),
		AmountCents: amountCents, ShotsPlanned: 4, PrintCopies: 1,
	})
	if err != nil {
		t.Fatalf("create session: %v", err)
	}
	claimed, err := sessions.ClaimForCharge(ctx, b.ID, s.SessionNumber, s.SessionNumber)
	if err != nil {
		t.Fatalf("claim: %v", err)
	}
	out, err := sessions.AttachQRIS(ctx, repository.AttachQRISInput{
		SessionID: claimed.ID, TransactionID: "txn-seed", QRString: "0002010102",
	})
	if err != nil {
		t.Fatalf("attach qris: %v", err)
	}
	return out, sessions
}

func pbNotification(orderID, gross string) map[string]string {
	return map[string]string{
		"order_id":           orderID,
		"status_code":        "200",
		"gross_amount":       gross,
		"transaction_status": "settlement",
		"fraud_status":       "accept",
		"transaction_id":     "midtrans-txn-1",
		"signature_key":      midtransSignature(orderID, "200", gross),
	}
}

func TestPhotoBoothWebhookSettles(t *testing.T) {
	pool := adminTestPool(t)
	defer pool.Close()
	ctx := context.Background()

	s, sessions := seedChargedSession(t, pool, 2500000) // Rp 25.000
	h, _ := pbWebhookHandler(t, pool)

	rec := postNotification(t, h, pbNotification(s.SessionNumber, "25000.00"))
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, rec.Body.String())
	}

	after, err := sessions.FindByProviderOrderID(ctx, s.SessionNumber)
	if err != nil {
		t.Fatal(err)
	}
	if after.PaymentStatus != "paid" {
		t.Fatalf("payment_status = %s, want paid", after.PaymentStatus)
	}
	if after.ProviderTransactionID != "midtrans-txn-1" {
		t.Errorf("transaction id = %q, want the one Midtrans sent", after.ProviderTransactionID)
	}
}

// A redelivered notification must change nothing. Midtrans retries, and an
// unattended booth would otherwise have no way to notice a double settle.
func TestPhotoBoothWebhookReplayIsInert(t *testing.T) {
	pool := adminTestPool(t)
	defer pool.Close()
	ctx := context.Background()

	s, sessions := seedChargedSession(t, pool, 2500000)
	h, _ := pbWebhookHandler(t, pool)
	body := pbNotification(s.SessionNumber, "25000.00")

	for i := 0; i < 3; i++ {
		if rec := postNotification(t, h, body); rec.Code != http.StatusOK {
			t.Fatalf("delivery %d: want 200, got %d", i, rec.Code)
		}
	}
	after, err := sessions.FindByProviderOrderID(ctx, s.SessionNumber)
	if err != nil {
		t.Fatal(err)
	}
	if after.PaymentStatus != "paid" {
		t.Fatalf("payment_status = %s after replays, want paid", after.PaymentStatus)
	}
	if after.NeedsReview {
		t.Error("a plain replay must not raise needs_review")
	}
}

// Money that does not match the session must not buy photos, and must not be
// swallowed silently either: ack so Midtrans stops retrying, flag for ops.
func TestPhotoBoothWebhookRefusesAmountMismatch(t *testing.T) {
	pool := adminTestPool(t)
	defer pool.Close()
	ctx := context.Background()

	s, sessions := seedChargedSession(t, pool, 2500000) // Rp 25.000
	h, _ := pbWebhookHandler(t, pool)

	// Midtrans reports Rp 1.000 against a Rp 25.000 session.
	rec := postNotification(t, h, pbNotification(s.SessionNumber, "1000.00"))
	if rec.Code != http.StatusOK {
		t.Fatalf("want a 200 ack, got %d: %s", rec.Code, rec.Body.String())
	}

	after, err := sessions.FindByProviderOrderID(ctx, s.SessionNumber)
	if err != nil {
		t.Fatal(err)
	}
	if after.PaymentStatus == "paid" {
		t.Fatal("settled on a mismatched amount")
	}
	if !after.NeedsReview {
		t.Error("needs_review = false; a mismatch has to reach a human")
	}
}

// A forged notification must be rejected before any lookup happens.
func TestPhotoBoothWebhookRejectsBadSignature(t *testing.T) {
	pool := adminTestPool(t)
	defer pool.Close()
	ctx := context.Background()

	s, sessions := seedChargedSession(t, pool, 2500000)
	h, _ := pbWebhookHandler(t, pool)

	body := pbNotification(s.SessionNumber, "25000.00")
	body["signature_key"] = "deadbeef"
	if rec := postNotification(t, h, body); rec.Code != http.StatusUnauthorized {
		t.Fatalf("want 401, got %d", rec.Code)
	}
	after, err := sessions.FindByProviderOrderID(ctx, s.SessionNumber)
	if err != nil {
		t.Fatal(err)
	}
	if after.PaymentStatus == "paid" {
		t.Fatal("a forged notification settled the session")
	}
}

// An order_id belonging to neither branch is acknowledged and ignored — the
// platform's Midtrans account may carry traffic we do not own.
func TestPhotoBoothWebhookIgnoresForeignPrefix(t *testing.T) {
	pool := adminTestPool(t)
	defer pool.Close()

	h, _ := pbWebhookHandler(t, pool)
	rec := postNotification(t, h, pbNotification("XYZ-not-ours", "25000.00"))
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200 ignore, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "ignored") {
		t.Errorf("body = %s, want an explicit ignore", rec.Body.String())
	}
}
