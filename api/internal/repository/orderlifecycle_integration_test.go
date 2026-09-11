package repository_test

// Integration tests for order-lifecycle accounting (real Postgres, see
// authflow_integration_test.go for how to run).
//
// These cover the counters a seller actually reads and acts on: the customer
// lifetime totals that drive the Pelanggan segments, the recorded refund
// amount, and which abandoned orders ever give their stock back.

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/sellon/sellon/api/internal/repository"
)

func customerTotals(t *testing.T, pool *pgxpool.Pool, storeID uuid.UUID, wa string) (orders int, spent int64) {
	t.Helper()
	if err := pool.QueryRow(context.Background(),
		`SELECT total_orders, total_spent_cents FROM customers
		 WHERE store_id = $1 AND whatsapp_number = $2`, storeID, wa).Scan(&orders, &spent); err != nil {
		t.Fatalf("read customer totals: %v", err)
	}
	return orders, spent
}

func placeOrder(t *testing.T, orders *repository.OrderRepo, storeID, productID uuid.UUID, wa string) *repository.Order {
	t.Helper()
	o, err := orders.Create(context.Background(), repository.CreateOrderInput{
		StoreID:       storeID,
		CustomerName:  "Buyer",
		CustomerWA:    wa,
		PaymentMethod: "transfer",
		Items: []repository.OrderItemInput{{
			ProductID: productID, ProductName: "Ebook",
			UnitCents: 5000000, Quantity: 1, ProductType: "digital",
		}},
	})
	if err != nil {
		t.Fatalf("create order: %v", err)
	}
	return o
}

// Create bumps total_orders/total_spent_cents at CHECKOUT. Nothing used to
// take them back down, so a buyer who ordered and cancelled repeatedly climbed
// into the seller's VIP segment without ever paying for anything.
func TestCancelReversesCustomerLifetimeTotals(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	orders := repository.NewOrderRepo(pool)
	storeID, productID := seedStoreProduct(t, pool)
	wa := "62811" + randSuffix()

	first := placeOrder(t, orders, storeID, productID, wa)
	placeOrder(t, orders, storeID, productID, wa)

	if n, spent := customerTotals(t, pool, storeID, wa); n != 2 || spent != 10000000 {
		t.Fatalf("after two orders: got %d orders / %d cents, want 2 / 10000000", n, spent)
	}

	if err := orders.Cancel(ctx, storeID, first.ID, "berubah pikiran"); err != nil {
		t.Fatalf("cancel: %v", err)
	}
	if n, spent := customerTotals(t, pool, storeID, wa); n != 1 || spent != 5000000 {
		t.Fatalf("after cancel: got %d orders / %d cents, want 1 / 5000000", n, spent)
	}

	// A second cancel is refused by the status guard, so the reversal cannot
	// run twice and drive the buyer's history negative.
	if err := orders.Cancel(ctx, storeID, first.ID, "lagi"); err == nil {
		t.Error("cancelling an already-cancelled order should be refused")
	}
	if n, spent := customerTotals(t, pool, storeID, wa); n != 1 || spent != 5000000 {
		t.Fatalf("after repeat cancel: got %d orders / %d cents, want 1 / 5000000", n, spent)
	}
}

// A refund cancels the order too, so the totals come off exactly once — and
// refunding an order that was ALREADY cancelled must not take them off twice.
func TestRefundReversesTotalsExactlyOnce(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	orders := repository.NewOrderRepo(pool)

	t.Run("paid then refunded", func(t *testing.T) {
		storeID, productID := seedStoreProduct(t, pool)
		wa := "62812" + randSuffix()
		o := placeOrder(t, orders, storeID, productID, wa)
		if _, err := orders.SetPaymentStatusGuarded(ctx, storeID, o.ID, "paid", "transfer"); err != nil {
			t.Fatalf("mark paid: %v", err)
		}
		if err := orders.Refund(ctx, storeID, o.ID, o.TotalCents, "barang rusak"); err != nil {
			t.Fatalf("refund: %v", err)
		}
		if n, spent := customerTotals(t, pool, storeID, wa); n != 0 || spent != 0 {
			t.Fatalf("after refund: got %d orders / %d cents, want 0 / 0", n, spent)
		}
	})

	t.Run("cancelled then refunded", func(t *testing.T) {
		storeID, productID := seedStoreProduct(t, pool)
		wa := "62813" + randSuffix()
		o := placeOrder(t, orders, storeID, productID, wa)
		second := placeOrder(t, orders, storeID, productID, wa)
		_ = second
		if _, err := orders.SetPaymentStatusGuarded(ctx, storeID, o.ID, "paid", "transfer"); err != nil {
			t.Fatalf("mark paid: %v", err)
		}
		if err := orders.Cancel(ctx, storeID, o.ID, "stok habis"); err != nil {
			t.Fatalf("cancel: %v", err)
		}
		// One order left on the books after the cancel.
		if n, spent := customerTotals(t, pool, storeID, wa); n != 1 || spent != 5000000 {
			t.Fatalf("after cancel: got %d / %d, want 1 / 5000000", n, spent)
		}
		if err := orders.Refund(ctx, storeID, o.ID, o.TotalCents, "dikembalikan"); err != nil {
			t.Fatalf("refund: %v", err)
		}
		// The refund must NOT double-subtract the order the cancel already took off.
		if n, spent := customerTotals(t, pool, storeID, wa); n != 1 || spent != 5000000 {
			t.Fatalf("after refund of a cancelled order: got %d / %d, want 1 / 5000000", n, spent)
		}
	})
}

// Midtrans sends the CUMULATIVE refunded amount and its notifications are
// neither ordered nor delivered once. A replayed older notification must not
// rewrite the order to show less money refunded than actually went back.
func TestPartialRefundNeverMovesBackwards(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	orders := repository.NewOrderRepo(pool)
	storeID, productID := seedStoreProduct(t, pool)

	o := placeOrder(t, orders, storeID, productID, "62814"+randSuffix())
	if _, err := orders.SetPaymentStatusGuarded(ctx, storeID, o.ID, "paid", "transfer"); err != nil {
		t.Fatalf("mark paid: %v", err)
	}

	if err := orders.RecordPartialRefund(ctx, storeID, o.ID, 1000000, "sebagian"); err != nil {
		t.Fatalf("first partial: %v", err)
	}
	if err := orders.RecordPartialRefund(ctx, storeID, o.ID, 3000000, "sebagian lagi"); err != nil {
		t.Fatalf("second partial: %v", err)
	}
	// A replay of the FIRST notification, arriving late.
	if err := orders.RecordPartialRefund(ctx, storeID, o.ID, 1000000, "replay"); err != nil {
		t.Fatalf("replay: %v", err)
	}

	got, err := orders.FindByID(ctx, storeID, o.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.RefundAmountCents != 3000000 {
		t.Fatalf("recorded refund: got %d, want 3000000 (the highest cumulative amount seen)",
			got.RefundAmountCents)
	}
}

// The webhook writes payment_status='failed' and then cancels to release
// stock. A settlement can land in that gap, and an unguarded cancel would then
// cancel an order the buyer actually paid for.
func TestCancelIfNotSettledRefusesPaidOrders(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	orders := repository.NewOrderRepo(pool)
	storeID, productID := seedStoreProduct(t, pool)

	paid := placeOrder(t, orders, storeID, productID, "62815"+randSuffix())
	if _, err := orders.SetPaymentStatusGuarded(ctx, storeID, paid.ID, "paid", "midtrans"); err != nil {
		t.Fatalf("mark paid: %v", err)
	}
	if err := orders.CancelIfNotSettled(ctx, storeID, paid.ID, "gagal"); err == nil {
		t.Fatal("a paid order must not be cancelled by the failed-payment branch")
	}

	// An order still carrying no money is exactly what the branch is for,
	// including the 'failed' state the webhook just wrote.
	failed := placeOrder(t, orders, storeID, productID, "62816"+randSuffix())
	if _, err := orders.SetPaymentStatusGuarded(ctx, storeID, failed.ID, "failed", "midtrans"); err != nil {
		t.Fatalf("mark failed: %v", err)
	}
	if err := orders.CancelIfNotSettled(ctx, storeID, failed.ID, "gagal"); err != nil {
		t.Fatalf("failed order should cancel: %v", err)
	}
}

// A buyer who presses "saya sudah bayar" without uploading proof parks the
// order at payment_status='pending'. The expiry worker only matched 'unpaid',
// so that order held its stock forever if the gateway's expire notification
// never arrived.
func TestExpirySweepsPendingPayments(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	orders := repository.NewOrderRepo(pool)
	storeID, productID := seedStoreProduct(t, pool)

	o := placeOrder(t, orders, storeID, productID, "62817"+randSuffix())
	if _, err := orders.SetPaymentStatusGuarded(ctx, storeID, o.ID, "pending", "transfer"); err != nil {
		t.Fatalf("mark pending: %v", err)
	}
	// Age it past any cutoff the worker would use.
	if _, err := pool.Exec(ctx,
		`UPDATE orders SET created_at = now() - interval '48 hours' WHERE id = $1`, o.ID); err != nil {
		t.Fatal(err)
	}

	// Its longer grace period is real: a cutoff inside the grace leaves it alone.
	now := time.Now()
	if _, err := orders.ExpireStaleUnpaid(ctx, now.Add(-time.Hour), now.Add(-72*time.Hour)); err != nil {
		t.Fatalf("sweep inside grace: %v", err)
	}
	got, err := orders.FindByID(ctx, storeID, o.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Status == "cancelled" {
		t.Fatal("a pending payment inside its grace period must not be cancelled")
	}

	// Past the grace, it is released.
	if _, err := orders.ExpireStaleUnpaid(ctx, now.Add(-time.Hour), now.Add(-24*time.Hour)); err != nil {
		t.Fatalf("sweep past grace: %v", err)
	}
	got, err = orders.FindByID(ctx, storeID, o.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Status != "cancelled" {
		t.Fatalf("stale pending order should be cancelled, got status %q", got.Status)
	}
	// And its customer totals come back off, same as a manual cancel.
	if n, spent := customerTotals(t, pool, storeID, got.CustomerWhatsApp); n != 0 || spent != 0 {
		t.Fatalf("after expiry: got %d orders / %d cents, want 0 / 0", n, spent)
	}
}

// A genuine double-tap collides on the partial unique index from migration
// 0090. That means the order EXISTS — the caller needs to know to replay it,
// not to report a failure that makes the buyer order again.
func TestDuplicateIdempotencyKeyIsTyped(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	orders := repository.NewOrderRepo(pool)
	storeID, productID := seedStoreProduct(t, pool)

	key := "idem-" + randSuffix()
	in := repository.CreateOrderInput{
		StoreID:        storeID,
		CustomerName:   "Buyer",
		CustomerWA:     "62818" + randSuffix(),
		PaymentMethod:  "transfer",
		IdempotencyKey: key,
		Items: []repository.OrderItemInput{{
			ProductID: productID, ProductName: "Ebook",
			UnitCents: 5000000, Quantity: 1, ProductType: "digital",
		}},
	}
	first, err := orders.Create(ctx, in)
	if err != nil {
		t.Fatalf("first create: %v", err)
	}
	if _, err := orders.Create(ctx, in); err != repository.ErrDuplicateIdempotencyKey {
		t.Fatalf("second create: want ErrDuplicateIdempotencyKey, got %v", err)
	}
	found, err := orders.FindByIdempotencyKey(ctx, storeID, key)
	if err != nil || found == nil {
		t.Fatalf("lookup by key: %v", err)
	}
	if found.OrderNumber != first.OrderNumber {
		t.Fatalf("replay returned a different order: %s vs %s", found.OrderNumber, first.OrderNumber)
	}
}
