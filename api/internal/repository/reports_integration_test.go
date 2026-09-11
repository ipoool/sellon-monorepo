package repository_test

// Integration tests for Laporan (real Postgres, see
// authflow_integration_test.go for how to run).
//
// Laporan renders the headline, the charts, Produk Terlaris and Pelanggan
// Teratas on ONE page. They used three different definitions of "counts as
// revenue", so the same store read differently depending on which panel the
// seller looked at. These tests pin them to one rule.

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/sellon/sellon/api/internal/repository"
)

// reportOrder places an order and drives it to the given state.
func reportOrder(t *testing.T, pool *pgxpool.Pool, orders *repository.OrderRepo,
	storeID, productID uuid.UUID, wa string, qty int, paymentStatus, status string) *repository.Order {
	t.Helper()
	ctx := context.Background()
	o, err := orders.Create(ctx, repository.CreateOrderInput{
		StoreID:       storeID,
		CustomerName:  "Buyer",
		CustomerWA:    wa,
		PaymentMethod: "transfer",
		Items: []repository.OrderItemInput{{
			ProductID: productID, ProductName: "Ebook",
			UnitCents: 1000000, Quantity: qty, ProductType: "digital",
		}},
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if paymentStatus != "unpaid" {
		if _, err := orders.SetPaymentStatusGuarded(ctx, storeID, o.ID, paymentStatus, "transfer"); err != nil {
			t.Fatalf("set payment status %q: %v", paymentStatus, err)
		}
	}
	if status != "" && status != "pending" {
		// Written directly: the point of these tests is the reporting rule,
		// not the transition guards, and 'processing' is reached by a seller
		// action the reports layer knows nothing about.
		if _, err := pool.Exec(ctx,
			`UPDATE orders SET status = $2 WHERE id = $1`, o.ID, status); err != nil {
			t.Fatalf("set status %q: %v", status, err)
		}
	}
	return o
}

func TestReportPanelsShareOneRevenueDefinition(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	orders := repository.NewOrderRepo(pool)
	reports := repository.NewReportsRepo(pool)
	storeID, productID := seedStoreProduct(t, pool)
	wa := "62821" + randSuffix()

	// A paid order still being packed. It IS revenue.
	reportOrder(t, pool, orders, storeID, productID, wa, 2, "paid", "processing")
	// An order nobody ever paid for, with a big quantity — this is what used
	// to dominate Produk Terlaris.
	reportOrder(t, pool, orders, storeID, productID, wa, 50, "unpaid", "pending")

	since := time.Now().Add(-time.Hour)
	until := time.Now().Add(time.Hour)

	head, err := reports.Headline(ctx, storeID, since, until)
	if err != nil {
		t.Fatalf("headline: %v", err)
	}
	if head.RevenueCents != 2000000 {
		t.Fatalf("headline revenue: got %d, want 2000000", head.RevenueCents)
	}

	top, err := reports.TopProducts(ctx, storeID, since, until, 10)
	if err != nil {
		t.Fatalf("top products: %v", err)
	}
	if len(top) != 1 {
		t.Fatalf("top products rows: got %d, want 1 (the unpaid order must not appear)", len(top))
	}
	if top[0].QtySold != 2 {
		t.Fatalf("top product qty: got %d, want 2 — the 50 unpaid units must not be counted as sold",
			top[0].QtySold)
	}

	cust, err := reports.TopCustomers(ctx, storeID, since, until, 10)
	if err != nil {
		t.Fatalf("top customers: %v", err)
	}
	if len(cust) != 1 {
		t.Fatalf("top customers rows: got %d, want 1", len(cust))
	}
	// The paid-but-not-yet-completed order used to be invisible here.
	if cust[0].TotalSpentCnt != head.RevenueCents {
		t.Fatalf("customer spend %d does not match headline revenue %d — the two panels disagree",
			cust[0].TotalSpentCnt, head.RevenueCents)
	}
	// Count and money must be computed on the same rule.
	if cust[0].Orders != 1 {
		t.Fatalf("customer order count: got %d, want 1", cust[0].Orders)
	}
}

// A partial refund keeps the order 'paid', so the money that went back to the
// buyer was still being reported as revenue.
func TestPartialRefundIsNettedOffRevenue(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	orders := repository.NewOrderRepo(pool)
	reports := repository.NewReportsRepo(pool)
	storeID, productID := seedStoreProduct(t, pool)
	wa := "62822" + randSuffix()

	o := reportOrder(t, pool, orders, storeID, productID, wa, 3, "paid", "processing")
	if err := orders.RecordPartialRefund(ctx, storeID, o.ID, 1000000, "satu item dikembalikan"); err != nil {
		t.Fatalf("partial refund: %v", err)
	}

	since := time.Now().Add(-time.Hour)
	until := time.Now().Add(time.Hour)
	head, err := reports.Headline(ctx, storeID, since, until)
	if err != nil {
		t.Fatal(err)
	}
	if head.RevenueCents != 2000000 {
		t.Fatalf("revenue after a 1.000.000 partial refund on a 3.000.000 order: got %d, want 2000000",
			head.RevenueCents)
	}

	cust, err := reports.TopCustomers(ctx, storeID, since, until, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(cust) != 1 || cust[0].TotalSpentCnt != 2000000 {
		t.Fatalf("customer spend should net the refund too, got %+v", cust)
	}
}
