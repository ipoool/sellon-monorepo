package repository_test

// Integration test for buyer tracking consent (real Postgres, see
// authflow_integration_test.go for how to run).
//
// The storefront cookie banner tells the buyer that "Tolak" stops their data
// reaching Meta. That was only true of the browser Pixel — the server-side
// Conversions API still sent a Purchase carrying their email and phone,
// because the answer was never recorded anywhere the server could see it.
// This pins the round trip the Meta notifier depends on: what checkout sends
// must come back out of FindByID unchanged.

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/sellon/sellon/api/internal/repository"
)

func TestOrderTrackingConsentRoundTrip(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	orders := repository.NewOrderRepo(pool)

	refused, accepted := false, true
	cases := []struct {
		name string
		want *bool
	}{
		// The case the whole change exists for.
		{"refused", &refused},
		{"accepted", &accepted},
		// No banner shown (POS, kiosk) or an order predating the column:
		// nothing was promised, so nothing is suppressed.
		{"not recorded", nil},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			storeID, productID := seedStoreProduct(t, pool)
			created, err := orders.Create(ctx, repository.CreateOrderInput{
				StoreID:         storeID,
				CustomerName:    "Buyer",
				CustomerWA:      "628111111111",
				CustomerEmail:   "buyer@example.com",
				PaymentMethod:   "transfer",
				TrackingConsent: tc.want,
				Items: []repository.OrderItemInput{{
					ProductID:   productID,
					ProductName: "Ebook",
					UnitCents:   5000000,
					Quantity:    1,
					ProductType: "digital",
				}},
			})
			if err != nil {
				t.Fatalf("create: %v", err)
			}

			// FindByID is exactly what meta.Notifier.OnPaymentPaid calls, so
			// this is the read that decides whether the event fires.
			got, err := orders.FindByID(ctx, storeID, created.ID)
			if err != nil {
				t.Fatalf("find: %v", err)
			}
			switch {
			case tc.want == nil && got.TrackingConsent != nil:
				t.Fatalf("want not recorded, got %v", *got.TrackingConsent)
			case tc.want != nil && got.TrackingConsent == nil:
				t.Fatalf("want %v, got not recorded", *tc.want)
			case tc.want != nil && *got.TrackingConsent != *tc.want:
				t.Fatalf("want %v, got %v", *tc.want, *got.TrackingConsent)
			}

			// Mirror the notifier's own guard: only an explicit refusal stops
			// the server-side Purchase.
			suppressed := got.TrackingConsent != nil && !*got.TrackingConsent
			if wantSuppressed := tc.want != nil && !*tc.want; suppressed != wantSuppressed {
				t.Fatalf("suppression: want %v, got %v", wantSuppressed, suppressed)
			}
		})
	}
}

// seedStoreProduct creates the user → store → product chain an order needs.
func seedStoreProduct(t *testing.T, pool *pgxpool.Pool) (storeID, productID uuid.UUID) {
	t.Helper()
	ctx := context.Background()
	sfx := randSuffix()

	var userID uuid.UUID
	if err := pool.QueryRow(ctx,
		`INSERT INTO users (email, name) VALUES ($1, 'Fixture') RETURNING id`,
		"consent-"+sfx+"@example.com").Scan(&userID); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	if err := pool.QueryRow(ctx,
		`INSERT INTO stores (owner_id, slug, name) VALUES ($1, $2, 'Fixture Store') RETURNING id`,
		userID, "consent-"+sfx).Scan(&storeID); err != nil {
		t.Fatalf("seed store: %v", err)
	}
	if err := pool.QueryRow(ctx,
		`INSERT INTO products (store_id, name, slug, product_type, price_cents)
		 VALUES ($1, 'Ebook', $2, 'digital', 5000000) RETURNING id`,
		storeID, "ebook-"+sfx).Scan(&productID); err != nil {
		t.Fatalf("seed product: %v", err)
	}
	return storeID, productID
}
