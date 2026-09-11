package repository_test

// Integration tests for subscription payment proofs (real Postgres, see
// authflow_integration_test.go for how to run).
//
// Manual-transfer upgrades are activated by hand. The receipt is the only
// evidence the admin has, so these pin who may attach one and when.

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/sellon/sellon/api/internal/repository"
)

func seedPendingInvoice(t *testing.T, pool *pgxpool.Pool) (storeID uuid.UUID, inv *repository.SubscriptionInvoice, subs *repository.SubscriptionRepo) {
	t.Helper()
	ctx := context.Background()
	sfx := randSuffix()

	var userID uuid.UUID
	if err := pool.QueryRow(ctx,
		`INSERT INTO users (email, name) VALUES ($1, 'Seller') RETURNING id`,
		"proof-"+sfx+"@example.com").Scan(&userID); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	if err := pool.QueryRow(ctx,
		`INSERT INTO stores (owner_id, slug, name) VALUES ($1, $2, 'Proof Store') RETURNING id`,
		userID, "proof-"+sfx).Scan(&storeID); err != nil {
		t.Fatalf("seed store: %v", err)
	}
	subs = repository.NewSubscriptionRepo(pool)
	sub, err := subs.GetOrCreate(ctx, storeID)
	if err != nil {
		t.Fatalf("seed subscription: %v", err)
	}
	inv, err = subs.CreatePendingInvoice(ctx, storeID, sub.ID, 9900000, "pro", 1, "test")
	if err != nil {
		t.Fatalf("seed invoice: %v", err)
	}
	return storeID, inv, subs
}

func TestSubscriptionProofAttachesToPendingInvoice(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	storeID, inv, subs := seedPendingInvoice(t, pool)

	if inv.PaymentProofURL != "" {
		t.Fatalf("a fresh invoice should carry no proof, got %q", inv.PaymentProofURL)
	}

	const url = "https://api.example/files/store/subscription_proofs/a.jpg"
	if err := subs.SetInvoicePaymentProof(ctx, storeID, inv.ID, url); err != nil {
		t.Fatalf("attach proof: %v", err)
	}

	// Read it back the way the seller's own subscription page does — a
	// manual invoice carries no provider order id to look it up by.
	list, err := subs.ListInvoices(ctx, storeID)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || list[0].PaymentProofURL != url {
		t.Fatalf("proof did not round-trip: %+v", list)
	}
	if list[0].PaymentProofAt == nil {
		t.Error("payment_proof_at should be stamped alongside the URL")
	}

	// The seller correcting their own mistake must be able to replace it
	// while the invoice is still pending.
	const better = "https://api.example/files/store/subscription_proofs/b.jpg"
	if err := subs.SetInvoicePaymentProof(ctx, storeID, inv.ID, better); err != nil {
		t.Fatalf("replace proof on a pending invoice: %v", err)
	}
}

// Once ops has settled the invoice, the proof is the evidence that decision
// was made against — a late upload must not quietly replace it.
func TestSubscriptionProofRefusedAfterSettlement(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	storeID, inv, subs := seedPendingInvoice(t, pool)

	const url = "https://api.example/files/store/subscription_proofs/a.jpg"
	if err := subs.SetInvoicePaymentProof(ctx, storeID, inv.ID, url); err != nil {
		t.Fatal(err)
	}
	if _, _, err := subs.SettleInvoice(ctx, inv.ID); err != nil {
		t.Fatalf("settle: %v", err)
	}
	if err := subs.SetInvoicePaymentProof(ctx, storeID, inv.ID,
		"https://api.example/files/store/subscription_proofs/swapped.jpg"); err != repository.ErrInvoiceNotPending {
		t.Fatalf("want ErrInvoiceNotPending after settlement, got %v", err)
	}

	list, err := subs.ListInvoices(ctx, storeID)
	if err != nil {
		t.Fatal(err)
	}
	if list[0].PaymentProofURL != url {
		t.Fatalf("settled invoice's proof was replaced: %q", list[0].PaymentProofURL)
	}
}

// An invoice id from another tenant must match nothing.
func TestSubscriptionProofCannotCrossTenants(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	_, victimInv, subs := seedPendingInvoice(t, pool)
	attackerStore, _, _ := seedPendingInvoice(t, pool)

	if err := subs.SetInvoicePaymentProof(ctx, attackerStore, victimInv.ID,
		"https://api.example/files/attacker.jpg"); err != repository.ErrInvoiceNotPending {
		t.Fatalf("want refusal across tenants, got %v", err)
	}
}
