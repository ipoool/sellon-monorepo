package repository_test

// Integration tests for the POS shift invariants (real Postgres — see
// authflow_integration_test.go for how to run). Two money bugs live here:
// a sale attaching to a shift that closed mid-transaction, and change being
// recorded against payments that never touched the drawer. Both are only
// observable against a real database, so nothing here is mocked.
//
//	TEST_DATABASE_URL='postgres://sellon:sellon@localhost:55433/sellon_test' \
//	  go test ./internal/repository/ -run POS -v

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/sellon/sellon/api/internal/repository"
)

// seedPOSShift builds the user → store → product → open-shift chain a POS sale
// needs. Distinct from seedStoreProduct because POS sells a *physical* product
// with stock and needs the store owner's id to act as the cashier who owns the
// shift.
func seedPOSShift(t *testing.T, pool *pgxpool.Pool, openingCents int64) (storeID, cashierID, productID, sessionID uuid.UUID) {
	t.Helper()
	ctx := context.Background()
	sfx := randSuffix()

	if err := pool.QueryRow(ctx,
		`INSERT INTO users (email, name) VALUES ($1, 'Kasir') RETURNING id`,
		"pos-"+sfx+"@example.com").Scan(&cashierID); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	if err := pool.QueryRow(ctx,
		`INSERT INTO stores (owner_id, slug, name) VALUES ($1, $2, 'Warung Fixture') RETURNING id`,
		cashierID, "pos-"+sfx).Scan(&storeID); err != nil {
		t.Fatalf("seed store: %v", err)
	}
	// Generous stock so a concurrency test never trips the stock guard and
	// reports a stock failure as if it were a session failure.
	if err := pool.QueryRow(ctx,
		`INSERT INTO products (store_id, name, slug, product_type, price_cents, stock)
		 VALUES ($1, 'Kopi Susu', $2, 'physical', 2500000, 100000) RETURNING id`,
		storeID, "kopi-"+sfx).Scan(&productID); err != nil {
		t.Fatalf("seed product: %v", err)
	}
	if err := pool.QueryRow(ctx,
		`INSERT INTO pos_sessions (store_id, opened_by, opening_cash_cents) VALUES ($1, $2, $3) RETURNING id`,
		storeID, cashierID, openingCents).Scan(&sessionID); err != nil {
		t.Fatalf("seed session: %v", err)
	}
	return storeID, cashierID, productID, sessionID
}

// posSale is the smallest valid CreatePOSOrderInput: one line, priced by the
// caller so a single seeded product can stand in for any ticket total.
func posSale(storeID, sessionID, cashierID, productID uuid.UUID, unitCents int64, payments ...repository.POSPayment) repository.CreatePOSOrderInput {
	return repository.CreatePOSOrderInput{
		StoreID:   storeID,
		SessionID: sessionID,
		CashierID: cashierID,
		Items: []repository.POSOrderItem{{
			ProductID:   &productID,
			Quantity:    1,
			UnitCents:   unitCents,
			ProductName: "Kopi Susu",
			ProductType: "physical",
		}},
		Payments: payments,
	}
}

func cash(cents int64) repository.POSPayment {
	return repository.POSPayment{Method: "cash", AmountCents: cents}
}

func qris(cents int64) repository.POSPayment {
	return repository.POSPayment{Method: "qris", AmountCents: cents}
}

// A cashier hitting "Tutup Shift" while a sale is being rung up used to leave
// the sale attached to the closed session: CreatePOSOrder read the session
// status off its own snapshot and never locked the row, so the close ran its
// summary, wrote expected_cash_cents, committed — and then the sale landed.
// The cash the cashier had just put in the drawer was missing from the rekap
// they were reconciling against, with nothing in the data to say why.
//
// The fix makes the create hold the session row FOR SHARE for the life of its
// transaction, which is what CloseSession's FOR UPDATE serialises against.
// Here the close is simulated by an explicit transaction parked in exactly
// that window (row locked and flipped, not yet committed).
func TestPOSOrderRefusesShiftClosedMidSale(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	storeID, cashierID, productID, sessionID := seedPOSShift(t, pool, 0)
	repo := repository.NewPOSRepo(pool)

	closeTx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin close tx: %v", err)
	}
	defer closeTx.Rollback(ctx)
	var status string
	if err := closeTx.QueryRow(ctx,
		`SELECT status FROM pos_sessions WHERE id = $1 AND store_id = $2 FOR UPDATE`,
		sessionID, storeID).Scan(&status); err != nil {
		t.Fatalf("lock session: %v", err)
	}
	if _, err := closeTx.Exec(ctx,
		`UPDATE pos_sessions SET status = 'closed', closed_at = now() WHERE id = $1`,
		sessionID); err != nil {
		t.Fatalf("simulate close: %v", err)
	}

	type outcome struct {
		res *repository.POSOrderResult
		err error
	}
	done := make(chan outcome, 1)
	go func() {
		res, err := repo.CreatePOSOrder(ctx,
			posSale(storeID, sessionID, cashierID, productID, 2500000, cash(2500000)))
		done <- outcome{res, err}
	}()

	// With the lock in place the sale must park on the session row. Before the
	// fix it read the pre-close snapshot and committed straight through.
	select {
	case got := <-done:
		if got.err == nil {
			t.Fatalf("sale committed while a close held the session row — order %s attached to a closing shift", got.res.OrderNumber)
		}
		t.Fatalf("sale resolved without waiting on the closing shift: %v", got.err)
	case <-time.After(500 * time.Millisecond):
	}

	if err := closeTx.Commit(ctx); err != nil {
		t.Fatalf("commit close: %v", err)
	}

	select {
	case got := <-done:
		if !errors.Is(got.err, repository.ErrPOSSessionNotOpen) {
			t.Fatalf("want ErrPOSSessionNotOpen once the shift closed, got %v", got.err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("sale never unblocked after the close committed")
	}

	var orphans int
	if err := pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM orders WHERE pos_session_id = $1`, sessionID).Scan(&orphans); err != nil {
		t.Fatal(err)
	}
	if orphans != 0 {
		t.Fatalf("%d order(s) attached to the closed shift", orphans)
	}
}

// The session lock has to be FOR SHARE, not FOR UPDATE: a shift is a shared
// resource across terminals, and serialising every sale behind every other
// sale would turn a busy counter into a queue. Only a close may block a sale.
func TestPOSConcurrentSalesShareTheSessionLock(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	storeID, cashierID, productID, sessionID := seedPOSShift(t, pool, 0)
	repo := repository.NewPOSRepo(pool)

	// Stand in for a sale already in flight on the same shift.
	inFlight, err := pool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin in-flight tx: %v", err)
	}
	defer inFlight.Rollback(ctx)
	var status string
	if err := inFlight.QueryRow(ctx,
		`SELECT status FROM pos_sessions WHERE id = $1 AND store_id = $2 FOR SHARE`,
		sessionID, storeID).Scan(&status); err != nil {
		t.Fatalf("share-lock session: %v", err)
	}

	done := make(chan error, 1)
	go func() {
		_, err := repo.CreatePOSOrder(ctx,
			posSale(storeID, sessionID, cashierID, productID, 2500000, cash(2500000)))
		done <- err
	}()

	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("second concurrent sale failed: %v", err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("a sale blocked behind another in-flight sale — the session lock must be FOR SHARE")
	}
}

// The invariant the lock exists to protect: whatever expected_cash_cents the
// close writes must account for every order the same shift accepted. Run under
// real contention rather than a simulated window, so a regression that only
// shows up on live interleaving still gets caught.
func TestPOSShiftCloseCountsEverySaleItAccepted(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	const openingCents = 5000000
	storeID, cashierID, productID, sessionID := seedPOSShift(t, pool, openingCents)
	repo := repository.NewPOSRepo(pool)

	const sales = 8
	var wg sync.WaitGroup
	var mu sync.Mutex
	accepted := 0
	for i := 0; i < sales; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := repo.CreatePOSOrder(ctx,
				posSale(storeID, sessionID, cashierID, productID, 2500000, cash(3000000)))
			switch {
			case err == nil:
				mu.Lock()
				accepted++
				mu.Unlock()
			case errors.Is(err, repository.ErrPOSSessionNotOpen):
				// Expected for whoever arrived after the close won the row.
			default:
				t.Errorf("sale failed unexpectedly: %v", err)
			}
		}()
	}

	// Let a few sales get in flight so the close really has to interleave.
	time.Sleep(20 * time.Millisecond)
	closeErr := repo.CloseSession(ctx, sessionID, storeID, cashierID, 0, true)
	wg.Wait()
	if closeErr != nil {
		t.Fatalf("close shift: %v", closeErr)
	}

	var expected *int64
	if err := pool.QueryRow(ctx,
		`SELECT expected_cash_cents FROM pos_sessions WHERE id = $1`, sessionID).Scan(&expected); err != nil {
		t.Fatal(err)
	}
	if expected == nil {
		t.Fatal("closed shift has no expected_cash_cents")
	}

	// Rebuild the drawer figure straight from what is attached to the shift.
	var cashTaken, changeGiven int64
	if err := pool.QueryRow(ctx, `
		SELECT COALESCE(SUM(p.amount_cents), 0)
		FROM pos_order_payments p JOIN orders o ON o.id = p.order_id
		WHERE o.pos_session_id = $1 AND o.status <> 'cancelled' AND p.method = 'cash'
	`, sessionID).Scan(&cashTaken); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `
		SELECT COALESCE(SUM(o.change_amount_cents), 0)
		FROM orders o
		WHERE o.pos_session_id = $1 AND o.status <> 'cancelled'
	`, sessionID).Scan(&changeGiven); err != nil {
		t.Fatal(err)
	}

	want := openingCents + cashTaken - changeGiven
	if *expected != want {
		t.Fatalf("expected_cash_cents = %d but the shift's own orders add up to %d (%d sale(s) accepted) — a sale slipped past the close",
			*expected, want, accepted)
	}
	if accepted == 0 {
		t.Fatal("no sale was accepted; the test proved nothing")
	}
}

// change_amount_cents is cash physically handed back out of the drawer, so it
// can never exceed the cash that was tendered. Recording the raw over-tender
// (paid − total) booked a mistyped QRIS/EDC amount as kembalian: the receipt
// promised change nobody received, and because the shift summary nets change
// against the cash column for any order carrying a cash row, a split sale whose
// over-tender sat on the non-cash rail subtracted money that had never left the
// drawer — the shift then reconciled short by that amount.
func TestPOSChangeOnlyAppliesToTheCashTendered(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	const openingCents = 10000000
	storeID, cashierID, productID, sessionID := seedPOSShift(t, pool, openingCents)
	repo := repository.NewPOSRepo(pool)

	// 1. Plain cash, exact money. Baseline: the drawer keeps all of it.
	exact, err := repo.CreatePOSOrder(ctx,
		posSale(storeID, sessionID, cashierID, productID, 10000000, cash(10000000)))
	if err != nil {
		t.Fatalf("exact cash sale: %v", err)
	}
	if exact.ChangeAmountCents != 0 {
		t.Fatalf("exact cash sale recorded %d change", exact.ChangeAmountCents)
	}

	// 2. Split where the non-cash rail alone already covers the ticket. Only the
	// Rp 50.000 note can come back out of the drawer, not the Rp 75.000 the raw
	// arithmetic claims.
	split, err := repo.CreatePOSOrder(ctx,
		posSale(storeID, sessionID, cashierID, productID, 7500000, cash(5000000), qris(10000000)))
	if err != nil {
		t.Fatalf("split sale: %v", err)
	}
	if split.ChangeAmountCents != 5000000 {
		t.Fatalf("split sale change = %d, want 5000000 (capped at the cash tendered)", split.ChangeAmountCents)
	}

	// 3. Over-tendered QRIS with no cash at all. Nothing left the drawer, so
	// there is no change to record.
	nonCash, err := repo.CreatePOSOrder(ctx,
		posSale(storeID, sessionID, cashierID, productID, 7500000, qris(10000000)))
	if err != nil {
		t.Fatalf("non-cash sale: %v", err)
	}
	if nonCash.ChangeAmountCents != 0 {
		t.Fatalf("non-cash sale recorded %d change — no cash was tendered", nonCash.ChangeAmountCents)
	}

	// The same rule, asserted over everything the shift holds rather than the
	// three rows above, so any future path that writes change is covered too.
	var violations int
	if err := pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM orders o
		WHERE o.pos_session_id = $1
		  AND o.change_amount_cents > COALESCE((
			  SELECT SUM(p.amount_cents) FROM pos_order_payments p
			  WHERE p.order_id = o.id AND p.method = 'cash'
		  ), 0)
	`, sessionID).Scan(&violations); err != nil {
		t.Fatal(err)
	}
	if violations != 0 {
		t.Fatalf("%d order(s) hand back more change than the cash they took", violations)
	}

	// Drawer truth: Rp 100.000 + Rp 50.000 tendered, Rp 50.000 returned.
	summary, err := repo.GetSummary(ctx, sessionID, storeID)
	if err != nil {
		t.Fatalf("summary: %v", err)
	}
	if summary.TotalCash != 10000000 {
		t.Fatalf("summary cash = %d, want 10000000", summary.TotalCash)
	}
	if summary.ExpectedCash != openingCents+10000000 {
		t.Fatalf("expected cash = %d, want %d", summary.ExpectedCash, openingCents+10000000)
	}
}

// An offline sale replays whenever connectivity comes back, which is routinely
// after the shift it belongs to was closed. Rejecting it made the browser sync
// engine mark the order permanently failed, and a sale the cashier had already
// taken cash for disappeared from the books. It must record and flag instead —
// the same "conflict is flagged, not blocked" rule the rest of the offline
// path follows.
func TestLateOfflineSaleIsRecordedNotLost(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	storeID, cashierID, productID, sessionID := seedPOSShift(t, pool, 0)
	repo := repository.NewPOSRepo(pool)

	if _, err := pool.Exec(ctx,
		`UPDATE pos_sessions SET status = 'closed', closed_at = now() WHERE id = $1`,
		sessionID); err != nil {
		t.Fatalf("close shift: %v", err)
	}

	// An ONLINE sale on a closed shift is still refused — the cashier is at
	// the terminal and can open a new one.
	if _, err := repo.CreatePOSOrder(ctx,
		posSale(storeID, sessionID, cashierID, productID, 2500000, cash(2500000))); err != repository.ErrPOSSessionNotOpen {
		t.Fatalf("online sale on a closed shift: want ErrPOSSessionNotOpen, got %v", err)
	}

	// The queued offline sale lands, and carries a flag saying why.
	in := posSale(storeID, sessionID, cashierID, productID, 2500000, cash(2500000))
	in.Offline = true
	in.IdempotencyKey = "late-" + randSuffix()
	res, err := repo.CreatePOSOrder(ctx, in)
	if err != nil {
		t.Fatalf("late offline sale must be recorded, got: %v", err)
	}
	if !res.NeedsReview {
		t.Error("a sale landing after its shift closed must be flagged for the seller")
	}

	var reason string
	if err := pool.QueryRow(ctx,
		`SELECT COALESCE(review_reason, '') FROM orders WHERE id = $1`, res.OrderID).Scan(&reason); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(reason, "shift ditutup") {
		t.Errorf("review reason should say the shift had closed, got %q", reason)
	}
}

// Cash movements feed expected_cash_cents directly, so one landing after the
// close was counted is money in the drawer the rekap does not know about.
func TestCashMovementCannotLandOnAClosingShift(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	storeID, cashierID, _, sessionID := seedPOSShift(t, pool, 0)
	repo := repository.NewPOSRepo(pool)

	// Park a close in exactly the window between the check and the insert.
	closeTx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer closeTx.Rollback(ctx)
	var status string
	if err := closeTx.QueryRow(ctx,
		`SELECT status FROM pos_sessions WHERE id = $1 FOR UPDATE`, sessionID).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if _, err := closeTx.Exec(ctx,
		`UPDATE pos_sessions SET status = 'closed', closed_at = now() WHERE id = $1`, sessionID); err != nil {
		t.Fatal(err)
	}

	done := make(chan error, 1)
	go func() {
		_, mErr := repo.AddCashMovement(ctx, sessionID, storeID, cashierID, "in", 5000000, "setor modal")
		done <- mErr
	}()

	// The movement must still be blocked on the session lock, not already
	// committed against a shift that is closing.
	select {
	case mErr := <-done:
		t.Fatalf("cash movement completed before the close committed (err=%v) — it was not serialised", mErr)
	case <-time.After(300 * time.Millisecond):
	}

	if err := closeTx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	if mErr := <-done; mErr != repository.ErrPOSSessionNotOpen {
		t.Fatalf("after the close committed: want ErrPOSSessionNotOpen, got %v", mErr)
	}

	var n int
	if err := pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM pos_cash_movements WHERE pos_session_id = $1`, sessionID).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatalf("%d cash movement(s) landed on a closed shift", n)
	}
}
