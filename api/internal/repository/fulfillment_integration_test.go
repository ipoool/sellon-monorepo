package repository_test

// Integration test for the payment-integrity invariants (real Postgres, see
// authflow_integration_test.go for how to run). Guards the two rules that
// protect buyers from being charged or delivered twice.

import (
	"context"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/sellon/sellon/api/internal/repository"
)

// seedOrderItem creates the minimum fixture chain (user → store → product →
// order → order_item) with raw SQL so the test doesn't depend on the shape of
// half a dozen repo constructors.
func seedOrderItem(t *testing.T, pool *pgxpool.Pool) (storeID, orderID, itemID uuid.UUID) {
	t.Helper()
	ctx := context.Background()
	sfx := randSuffix()

	var userID uuid.UUID
	if err := pool.QueryRow(ctx,
		`INSERT INTO users (email, name) VALUES ($1, 'Fixture') RETURNING id`,
		"fixture-"+sfx+"@example.com").Scan(&userID); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	if err := pool.QueryRow(ctx,
		`INSERT INTO stores (owner_id, slug, name) VALUES ($1, $2, 'Fixture Store') RETURNING id`,
		userID, "fixture-"+sfx).Scan(&storeID); err != nil {
		t.Fatalf("seed store: %v", err)
	}
	var productID uuid.UUID
	if err := pool.QueryRow(ctx,
		`INSERT INTO products (store_id, name, slug) VALUES ($1, 'Ebook', $2) RETURNING id`,
		storeID, "ebook-"+sfx).Scan(&productID); err != nil {
		t.Fatalf("seed product: %v", err)
	}
	if err := pool.QueryRow(ctx,
		`INSERT INTO orders (store_id, order_number) VALUES ($1, $2) RETURNING id`,
		storeID, "SO-TEST-"+sfx).Scan(&orderID); err != nil {
		t.Fatalf("seed order: %v", err)
	}
	if err := pool.QueryRow(ctx,
		`INSERT INTO order_items (order_id, product_id, product_name, unit_price_cents, quantity, subtotal_cents)
		 VALUES ($1, $2, 'Ebook', 5000000, 1, 5000000) RETURNING id`,
		orderID, productID).Scan(&itemID); err != nil {
		t.Fatalf("seed order_item: %v", err)
	}
	return storeID, orderID, itemID
}

// fulfillment.OnPaymentPaid is documented as the single, idempotent mint path,
// but nothing enforced one-token-per-item: a replayed settlement (or a
// mark-paid racing the webhook) minted a second token and sent a second
// delivery email. Migration 0098 + ON CONFLICT make a concurrent replay a
// no-op.
func TestDownloadTokenMintIsIdempotent(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	storeID, orderID, itemID := seedOrderItem(t, pool)
	tokens := repository.NewDownloadTokenRepo(pool)

	first, err := tokens.Create(ctx, repository.DownloadToken{
		OrderID: orderID, OrderItemID: itemID, StoreID: storeID,
	})
	if err != nil {
		t.Fatalf("first mint: %v", err)
	}

	// Second mint for the same item must be refused, not silently duplicated.
	if _, err := tokens.Create(ctx, repository.DownloadToken{
		OrderID: orderID, OrderItemID: itemID, StoreID: storeID,
	}); err != repository.ErrDownloadTokenExists {
		t.Fatalf("replay: want ErrDownloadTokenExists, got %v", err)
	}

	// And under real concurrency (webhook + manual mark-paid at once) exactly
	// one caller may win.
	const parallel = 10
	var wg sync.WaitGroup
	var mu sync.Mutex
	created := 0
	for i := 0; i < parallel; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := tokens.Create(ctx, repository.DownloadToken{
				OrderID: orderID, OrderItemID: itemID, StoreID: storeID,
			}); err == nil {
				mu.Lock()
				created++
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	if created != 0 {
		t.Fatalf("%d concurrent replays minted an extra token", created)
	}

	var count int
	if err := pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM download_tokens WHERE order_item_id = $1`, itemID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("want exactly 1 token for the item, got %d", count)
	}
	if first.Token == "" {
		t.Fatal("first mint returned an empty token")
	}
}

// A public GET on the buyer's order page lazily expires unpaid orders. The old
// Cancel only guarded `status`, so a payment settling between the read and the
// write left the order cancelled-but-paid with its stock already released.
// CancelIfUnpaid must refuse once payment has landed.
func TestCancelIfUnpaidRefusesPaidOrder(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	storeID, orderID, _ := seedOrderItem(t, pool)
	orders := repository.NewOrderRepo(pool)

	// Simulate the webhook winning the race.
	if _, err := pool.Exec(ctx,
		`UPDATE orders SET payment_status = 'paid' WHERE id = $1`, orderID); err != nil {
		t.Fatal(err)
	}

	if err := orders.CancelIfUnpaid(ctx, storeID, orderID, "Kadaluwarsa — tidak dibayar"); err == nil {
		t.Fatal("a paid order was cancelled by the lazy-expiry path")
	}

	var status, paymentStatus string
	if err := pool.QueryRow(ctx,
		`SELECT status, payment_status FROM orders WHERE id = $1`, orderID).
		Scan(&status, &paymentStatus); err != nil {
		t.Fatal(err)
	}
	if status == "cancelled" {
		t.Fatalf("order was cancelled despite being paid (payment_status=%s)", paymentStatus)
	}

	// An unpaid order in the same shape must still cancel normally.
	storeID2, orderID2, _ := seedOrderItem(t, pool)
	if err := orders.CancelIfUnpaid(ctx, storeID2, orderID2, "Kadaluwarsa — tidak dibayar"); err != nil {
		t.Fatalf("unpaid order should cancel, got %v", err)
	}
	if err := pool.QueryRow(ctx,
		`SELECT status FROM orders WHERE id = $1`, orderID2).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "cancelled" {
		t.Fatalf("unpaid order not cancelled, status=%s", status)
	}
}
