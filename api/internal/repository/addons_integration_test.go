package repository_test

// Add-on ownership and billing guards, against a real Postgres.
// Skipped unless TEST_DATABASE_URL is set — see authflow_integration_test.go.
//
//   TEST_DATABASE_URL='postgres://sellon:sellon@localhost:55432/sellon_test?sslmode=disable' \
//     go test ./internal/repository/ -run Addon -v
//
// The rule these protect is the one a seller can exploit by hand: an
// add-on that works immediately and is billed at the next renewal is free
// for the rest of the period, and nothing stops someone activating it on
// the last day of every period unless "free" is granted exactly once.

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/sellon/sellon/api/internal/repository"
)

func seedAddonStore(t *testing.T, pool *pgxpool.Pool) (uuid.UUID, *repository.SubscriptionRepo, uuid.UUID) {
	t.Helper()
	ctx := context.Background()
	sfx := randSuffix()

	var userID, storeID uuid.UUID
	if err := pool.QueryRow(ctx,
		`INSERT INTO users (email, name) VALUES ($1, 'Addon Seller') RETURNING id`,
		"addon-"+sfx+"@example.test").Scan(&userID); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	if err := pool.QueryRow(ctx,
		`INSERT INTO stores (owner_id, slug, name) VALUES ($1, $2, 'Addon Store') RETURNING id`,
		userID, "addon-"+sfx).Scan(&storeID); err != nil {
		t.Fatalf("seed store: %v", err)
	}
	subs := repository.NewSubscriptionRepo(pool)
	sub, err := subs.GetOrCreate(ctx, storeID)
	if err != nil {
		t.Fatalf("seed subscription: %v", err)
	}
	return storeID, subs, sub.ID
}

// The catalogue ships with the three packages the pricing page promises.
func TestAddonCatalogueIsSeeded(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	repo := repository.NewAddonRepo(pool)

	list, err := repo.ListAddons(context.Background(), false)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	got := map[string]bool{}
	for _, a := range list {
		got[a.Code] = true
		if a.MonthlyPriceCents <= 0 {
			t.Errorf("%s has no price", a.Code)
		}
	}
	for _, want := range []string{"kasir", "ai", "membership"} {
		if !got[want] {
			t.Errorf("add-on %q is missing from the catalogue", want)
		}
	}
}

// First activation gets the free tail. That is the product promise: it
// works now, you are billed at renewal.
func TestAddonFirstActivationIsFreeUntilPeriodEnd(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	storeID, _, _ := seedAddonStore(t, pool)
	repo := repository.NewAddonRepo(pool)

	end := time.Now().Add(72 * time.Hour)
	row, err := repo.Activate(ctx, storeID, "kasir", &end)
	if err != nil {
		t.Fatalf("activate: %v", err)
	}
	if row.FreeUntil == nil {
		t.Fatal("first activation got no free tail")
	}
	if !row.InFreeTail() {
		t.Error("a just-activated add-on should be inside its free tail")
	}
	if row.FirstBilledAt != nil {
		t.Error("nothing has been invoiced yet, but first_billed_at is set")
	}
}

// THE exploit this guards. Activate near the end of a period, cancel
// before renewal, activate again: without the once-per-store rule the
// add-on is free forever.
func TestAddonFreeTailIsGrantedOnlyOnce(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	storeID, _, _ := seedAddonStore(t, pool)
	repo := repository.NewAddonRepo(pool)

	end := time.Now().Add(48 * time.Hour)
	if _, err := repo.Activate(ctx, storeID, "kasir", &end); err != nil {
		t.Fatalf("first activate: %v", err)
	}
	if err := repo.Cancel(ctx, storeID, "kasir"); err != nil {
		t.Fatalf("cancel: %v", err)
	}

	again, err := repo.Activate(ctx, storeID, "kasir", &end)
	if err != nil {
		t.Fatalf("second activate: %v", err)
	}
	if again.FreeUntil != nil {
		t.Fatal("cycling the add-on earned a second free period")
	}
	if again.InFreeTail() {
		t.Fatal("re-activation is working unbilled")
	}
}

// Buying something you already have is refused by the database, not by a
// check someone has to remember to write.
func TestAddonCannotBeHeldTwice(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	storeID, _, _ := seedAddonStore(t, pool)
	repo := repository.NewAddonRepo(pool)

	end := time.Now().Add(24 * time.Hour)
	if _, err := repo.Activate(ctx, storeID, "kasir", &end); err != nil {
		t.Fatalf("activate: %v", err)
	}
	if _, err := repo.Activate(ctx, storeID, "kasir", &end); !errors.Is(err, repository.ErrAddonAlreadyHeld) {
		t.Fatalf("second activate returned %v, want ErrAddonAlreadyHeld", err)
	}
}

// Cancelling is idempotent and really removes the entitlement.
func TestAddonCancelIsIdempotent(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	storeID, _, _ := seedAddonStore(t, pool)
	repo := repository.NewAddonRepo(pool)

	end := time.Now().Add(24 * time.Hour)
	if _, err := repo.Activate(ctx, storeID, "ai", &end); err != nil {
		t.Fatalf("activate: %v", err)
	}
	if err := repo.Cancel(ctx, storeID, "ai"); err != nil {
		t.Fatalf("cancel: %v", err)
	}
	if err := repo.Cancel(ctx, storeID, "ai"); !errors.Is(err, repository.ErrAddonNotFound) {
		t.Fatalf("second cancel returned %v, want ErrAddonNotFound", err)
	}

	codes, err := repo.ActiveCodes(ctx, storeID)
	if err != nil {
		t.Fatalf("active codes: %v", err)
	}
	for _, c := range codes {
		if c == "ai" {
			t.Fatal("a cancelled add-on is still listed as active")
		}
	}
}

// A retired add-on cannot be bought, but the stores already holding it are
// untouched — retiring a product must not revoke what people paid for.
//
// Uses a throwaway add-on rather than retiring one from the real
// catalogue: an earlier version of this test restored the seeded row in
// t.Cleanup, which runs AFTER the deferred pool.Close(), so the restore
// failed silently and left "membership" retired for every test that ran
// afterwards.
func TestRetiredAddonCannotBeActivated(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	storeID, _, _ := seedAddonStore(t, pool)
	repo := repository.NewAddonRepo(pool)

	code := "tmp" + randSuffix()[:6]
	if _, err := pool.Exec(ctx, `
		INSERT INTO addons (code, name, monthly_price_cents, sort_order)
		VALUES ($1, 'Throwaway', 1000000, 99)`, code); err != nil {
		t.Fatalf("seed addon: %v", err)
	}
	defer func() {
		_, _ = pool.Exec(context.Background(),
			`DELETE FROM store_addons WHERE addon_code = $1`, code)
		_, _ = pool.Exec(context.Background(),
			`DELETE FROM addons WHERE code = $1`, code)
	}()

	end := time.Now().Add(24 * time.Hour)
	if _, err := repo.Activate(ctx, storeID, code, &end); err != nil {
		t.Fatalf("activate: %v", err)
	}

	a, err := repo.FindAddon(ctx, code)
	if err != nil {
		t.Fatalf("find: %v", err)
	}
	a.IsActive = false
	if _, err := repo.UpdateAddon(ctx, *a); err != nil {
		t.Fatalf("retire: %v", err)
	}

	// The holder keeps it.
	codes, _ := repo.ActiveCodes(ctx, storeID)
	found := false
	for _, c := range codes {
		if c == code {
			found = true
		}
	}
	if !found {
		t.Error("retiring an add-on revoked it from a store that had it")
	}

	// Nobody new can take it.
	otherStore, _, _ := seedAddonStore(t, pool)
	if _, err := repo.Activate(ctx, otherStore, code, &end); !errors.Is(err, repository.ErrAddonNotFound) {
		t.Fatalf("retired add-on was sold again: %v", err)
	}
}

// === Invoice lines ===

// The breakdown must add up to what Midtrans charges. A seller who totals
// the lines and gets a different number stops trusting the bill.
func TestInvoiceLinesMustSumToTheTotal(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	storeID, subs, subID := seedAddonStore(t, pool)

	_, err := subs.CreateCheckoutInvoiceWithLines(ctx, storeID, subID,
		20_000_000, "midtrans", "SUB-BAD-"+randSuffix(), "pro", 1, "test",
		[]repository.InvoiceLine{
			{Kind: "plan", Code: "pro", Description: "Pro", Months: 1,
				UnitPriceCents: 9_900_000, AmountCents: 9_900_000},
			{Kind: "addon", Code: "kasir", Description: "Paket Kasir", Months: 1,
				UnitPriceCents: 9_900_000, AmountCents: 9_900_000},
		})
	if !errors.Is(err, repository.ErrInvoiceLinesMismatch) {
		t.Fatalf("an invoice whose lines do not sum was accepted: %v", err)
	}
}

// Settling an invoice ends the free tail on the add-ons it charged, and
// only those.
func TestSettleEndsTheFreeTailOfBilledAddons(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	storeID, subs, subID := seedAddonStore(t, pool)
	repo := repository.NewAddonRepo(pool)

	end := time.Now().Add(48 * time.Hour)
	if _, err := repo.Activate(ctx, storeID, "kasir", &end); err != nil {
		t.Fatalf("activate kasir: %v", err)
	}
	if _, err := repo.Activate(ctx, storeID, "ai", &end); err != nil {
		t.Fatalf("activate ai: %v", err)
	}

	// Invoice charges the plan and ONE of the two add-ons.
	inv, err := subs.CreateCheckoutInvoiceWithLines(ctx, storeID, subID,
		19_800_000, "midtrans", "SUB-"+randSuffix(), "pro", 1, "test",
		[]repository.InvoiceLine{
			{Kind: "plan", Code: "pro", Description: "Pro", Months: 1,
				UnitPriceCents: 9_900_000, AmountCents: 9_900_000},
			{Kind: "addon", Code: "kasir", Description: "Paket Kasir", Months: 1,
				UnitPriceCents: 9_900_000, AmountCents: 9_900_000},
		})
	if err != nil {
		t.Fatalf("create invoice: %v", err)
	}
	if _, _, err := subs.SettleInvoice(ctx, inv.ID); err != nil {
		t.Fatalf("settle: %v", err)
	}

	rows, err := repo.ListForStore(ctx, storeID)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	for _, row := range rows {
		switch row.AddonCode {
		case "kasir":
			if row.FirstBilledAt == nil {
				t.Error("kasir was invoiced but its free tail did not end")
			}
		case "ai":
			if row.FirstBilledAt != nil {
				t.Error("ai was never invoiced but was marked billed")
			}
		}
	}
}

// A replayed settle must not rewrite when an add-on was first billed.
func TestSettleReplayDoesNotMoveFirstBilledAt(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	storeID, subs, subID := seedAddonStore(t, pool)
	repo := repository.NewAddonRepo(pool)

	end := time.Now().Add(48 * time.Hour)
	if _, err := repo.Activate(ctx, storeID, "kasir", &end); err != nil {
		t.Fatalf("activate: %v", err)
	}
	inv, err := subs.CreateCheckoutInvoiceWithLines(ctx, storeID, subID,
		9_900_000, "midtrans", "SUB-"+randSuffix(), "pro", 1, "test",
		[]repository.InvoiceLine{
			{Kind: "addon", Code: "kasir", Description: "Paket Kasir", Months: 1,
				UnitPriceCents: 9_900_000, AmountCents: 9_900_000},
		})
	if err != nil {
		t.Fatalf("invoice: %v", err)
	}
	if _, _, err := subs.SettleInvoice(ctx, inv.ID); err != nil {
		t.Fatalf("settle: %v", err)
	}

	before := firstBilled(t, pool, storeID, "kasir")
	// A duplicate Midtrans delivery.
	if _, _, err := subs.SettleInvoice(ctx, inv.ID); !errors.Is(err, repository.ErrInvoiceNotPending) {
		t.Fatalf("replay returned %v, want ErrInvoiceNotPending", err)
	}
	if after := firstBilled(t, pool, storeID, "kasir"); !after.Equal(before) {
		t.Fatalf("replay moved first_billed_at from %v to %v", before, after)
	}
}

func firstBilled(t *testing.T, pool *pgxpool.Pool, storeID uuid.UUID, code string) time.Time {
	t.Helper()
	var ts *time.Time
	if err := pool.QueryRow(context.Background(),
		`SELECT first_billed_at FROM store_addons
		 WHERE store_id = $1 AND addon_code = $2 AND cancelled_at IS NULL`,
		storeID, code).Scan(&ts); err != nil {
		t.Fatalf("read first_billed_at: %v", err)
	}
	if ts == nil {
		t.Fatal("first_billed_at is null")
	}
	return *ts
}

// The invoice breakdown survives a round trip so the seller's history can
// show what they actually bought.
func TestInvoiceLinesRoundTrip(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	storeID, subs, subID := seedAddonStore(t, pool)

	inv, err := subs.CreateCheckoutInvoiceWithLines(ctx, storeID, subID,
		17_800_000, "midtrans", "SUB-"+randSuffix(), "pro", 1, "test",
		[]repository.InvoiceLine{
			{Kind: "plan", Code: "pro", Description: "SellOn Pro", Months: 1,
				UnitPriceCents: 9_900_000, AmountCents: 9_900_000},
			{Kind: "addon", Code: "ai", Description: "Analisa AI", Months: 1,
				UnitPriceCents: 7_900_000, AmountCents: 7_900_000},
		})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	lines, err := subs.ListInvoiceLines(ctx, inv.ID)
	if err != nil {
		t.Fatalf("list lines: %v", err)
	}
	if len(lines) != 2 {
		t.Fatalf("got %d lines, want 2", len(lines))
	}
	var sum int64
	for _, l := range lines {
		sum += l.AmountCents
	}
	if sum != inv.AmountCents {
		t.Fatalf("lines sum to %d but the invoice says %d", sum, inv.AmountCents)
	}
}
