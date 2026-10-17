package repository_test

// Partner referral + commission guards, against a real Postgres.
// Skipped unless TEST_DATABASE_URL is set — see authflow_integration_test.go.
//
//   TEST_DATABASE_URL='postgres://sellon:sellon@localhost:55432/sellon_test?sslmode=disable' \
//     go test ./internal/repository/ -run Partner -v
//
// Every case here is a way the operator ends up paying a partner twice, or
// not at all, or paying the wrong one. None of them would be noticed quickly:
// an attribution bug is silent until someone adds up a month by hand.

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/sellon/sellon/api/internal/repository"
)

func newPartner(t *testing.T, repo *repository.PartnerRepo, bps int) *repository.Partner {
	t.Helper()
	code := fmt.Sprintf("P%s", randSuffix()[:6])
	p, err := repo.CreatePartner(context.Background(), repository.CreatePartnerInput{
		Code: code, Name: "Partner " + code, CommissionBps: bps,
		ContactEmail: "partner-" + code + "@example.test",
	})
	if err != nil {
		t.Fatalf("create partner: %v", err)
	}
	return p
}

// seedReferredSeller makes a user bonded to a partner, their store, and a
// subscription — the state a referred customer is in just before they pay.
func seedReferredSeller(t *testing.T, pool *pgxpool.Pool, repo *repository.PartnerRepo, code string) (userID, storeID uuid.UUID, subs *repository.SubscriptionRepo, subID uuid.UUID) {
	t.Helper()
	ctx := context.Background()
	sfx := randSuffix()

	if err := pool.QueryRow(ctx,
		`INSERT INTO users (email, name) VALUES ($1, 'Referred') RETURNING id`,
		"ref-"+sfx+"@example.test").Scan(&userID); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	if code != "" {
		if err := repo.BondReferral(ctx, userID, code, "email", "/"); err != nil {
			t.Fatalf("bond: %v", err)
		}
	}
	if err := pool.QueryRow(ctx,
		`INSERT INTO stores (owner_id, slug, name) VALUES ($1, $2, 'Toko Referred') RETURNING id`,
		userID, "ref-"+sfx).Scan(&storeID); err != nil {
		t.Fatalf("seed store: %v", err)
	}
	subs = repository.NewSubscriptionRepo(pool)
	sub, err := subs.GetOrCreate(ctx, storeID)
	if err != nil {
		t.Fatalf("seed subscription: %v", err)
	}
	return userID, storeID, subs, sub.ID
}

func countCommissions(t *testing.T, pool *pgxpool.Pool, partnerID uuid.UUID) int {
	t.Helper()
	var n int
	if err := pool.QueryRow(context.Background(),
		`SELECT count(*) FROM partner_commissions WHERE partner_id = $1 AND status <> 'void'`,
		partnerID).Scan(&n); err != nil {
		t.Fatalf("count commissions: %v", err)
	}
	return n
}

// === Attribution ===

// First touch wins. A partner who gets someone to sign up owns that
// attribution; a later link must not transfer the user — otherwise the last
// partner to send a newsletter harvests everyone else's work.
func TestPartnerReferralFirstTouchWins(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	repo := repository.NewPartnerRepo(pool)

	a := newPartner(t, repo, 2000)
	b := newPartner(t, repo, 3000)

	var userID uuid.UUID
	if err := pool.QueryRow(ctx,
		`INSERT INTO users (email, name) VALUES ($1, 'U') RETURNING id`,
		"ft-"+randSuffix()+"@example.test").Scan(&userID); err != nil {
		t.Fatalf("seed user: %v", err)
	}

	if err := repo.BondReferral(ctx, userID, a.Code, "email", "/"); err != nil {
		t.Fatalf("first bond: %v", err)
	}
	// Second partner's link, later. Must be a silent no-op, not an error and
	// not a transfer.
	if err := repo.BondReferral(ctx, userID, b.Code, "google", "/harga"); err != nil {
		t.Fatalf("second bond returned an error: %v", err)
	}

	var got uuid.UUID
	if err := pool.QueryRow(ctx,
		`SELECT partner_id FROM partner_referrals WHERE user_id = $1`, userID).Scan(&got); err != nil {
		t.Fatalf("read bond: %v", err)
	}
	if got != a.ID {
		t.Fatalf("user re-attributed to the second partner")
	}
}

// An unknown or paused code must not fail a signup.
func TestPartnerReferralUnknownCodeIsSilent(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	repo := repository.NewPartnerRepo(pool)

	var userID uuid.UUID
	if err := pool.QueryRow(ctx,
		`INSERT INTO users (email, name) VALUES ($1, 'U') RETURNING id`,
		"unk-"+randSuffix()+"@example.test").Scan(&userID); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	if err := repo.BondReferral(ctx, userID, "NOSUCHCODE", "email", ""); err != nil {
		t.Fatalf("unknown code should be a no-op, got %v", err)
	}
	if err := repo.BondReferral(ctx, userID, "", "email", ""); err != nil {
		t.Fatalf("empty code should be a no-op, got %v", err)
	}

	paused := newPartner(t, repo, 2000)
	if _, err := repo.UpdatePartner(ctx, repository.UpdatePartnerInput{
		ID: paused.ID, Name: paused.Name, CommissionBps: 2000, Status: "paused",
	}); err != nil {
		t.Fatalf("pause partner: %v", err)
	}
	if err := repo.BondReferral(ctx, userID, paused.Code, "email", ""); err != nil {
		t.Fatalf("paused partner: %v", err)
	}
	var n int
	if err := pool.QueryRow(ctx,
		`SELECT count(*) FROM partner_referrals WHERE user_id = $1`, userID).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 0 {
		t.Fatalf("a paused partner collected a referral")
	}
}

// === Accrual ===

func TestPartnerCommissionAccruesOnFirstPayment(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	repo := repository.NewPartnerRepo(pool)
	p := newPartner(t, repo, 2000)

	_, storeID, subs, subID := seedReferredSeller(t, pool, repo, p.Code)
	inv, err := subs.CreatePendingInvoice(ctx, storeID, subID, 9_900_000, "pro", 1, "test")
	if err != nil {
		t.Fatalf("invoice: %v", err)
	}
	if _, _, err := subs.SettleInvoice(ctx, inv.ID); err != nil {
		t.Fatalf("settle: %v", err)
	}

	list, _, err := repo.ListCommissions(ctx, p.ID, 10, 0)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("got %d commissions, want 1", len(list))
	}
	c := list[0]
	if want := int64(1_980_000); c.CommissionCents != want {
		t.Errorf("commission = %d, want %d (20%% of 9.900.000)", c.CommissionCents, want)
	}
	if c.BaseAmountCents != 9_900_000 || c.CommissionBps != 2000 {
		t.Errorf("snapshot wrong: base=%d bps=%d", c.BaseAmountCents, c.CommissionBps)
	}
	if c.Status != "earned" {
		t.Errorf("status = %q, want earned", c.Status)
	}
}

// The headline rule. A renewal is still the same customer the partner sent
// once; paying again every month would turn one introduction into an annuity
// nobody agreed to.
func TestPartnerCommissionOnlyOncePerUser(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	repo := repository.NewPartnerRepo(pool)
	p := newPartner(t, repo, 2000)

	_, storeID, subs, subID := seedReferredSeller(t, pool, repo, p.Code)
	for i := 0; i < 3; i++ {
		inv, err := subs.CreatePendingInvoice(ctx, storeID, subID, 9_900_000, "pro", 1, "test")
		if err != nil {
			t.Fatalf("invoice %d: %v", i, err)
		}
		if _, _, err := subs.SettleInvoice(ctx, inv.ID); err != nil {
			t.Fatalf("settle %d: %v", i, err)
		}
	}
	if n := countCommissions(t, pool, p.ID); n != 1 {
		t.Fatalf("got %d commissions across three payments, want 1", n)
	}
}

// Same owner, second store. Still one introduction, so still one commission.
func TestPartnerCommissionOncePerUserAcrossStores(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	repo := repository.NewPartnerRepo(pool)
	p := newPartner(t, repo, 2000)

	userID, storeA, subs, subA := seedReferredSeller(t, pool, repo, p.Code)

	var storeB uuid.UUID
	if err := pool.QueryRow(ctx,
		`INSERT INTO stores (owner_id, slug, name) VALUES ($1, $2, 'Toko Kedua') RETURNING id`,
		userID, "second-"+randSuffix()).Scan(&storeB); err != nil {
		t.Fatalf("seed second store: %v", err)
	}
	subBRow, err := subs.GetOrCreate(ctx, storeB)
	if err != nil {
		t.Fatalf("second subscription: %v", err)
	}

	for _, pair := range []struct {
		store uuid.UUID
		sub   uuid.UUID
	}{{storeA, subA}, {storeB, subBRow.ID}} {
		inv, err := subs.CreatePendingInvoice(ctx, pair.store, pair.sub, 9_900_000, "pro", 1, "test")
		if err != nil {
			t.Fatalf("invoice: %v", err)
		}
		if _, _, err := subs.SettleInvoice(ctx, inv.ID); err != nil {
			t.Fatalf("settle: %v", err)
		}
	}
	if n := countCommissions(t, pool, p.ID); n != 1 {
		t.Fatalf("got %d commissions across two stores, want 1", n)
	}
}

// A redelivered Midtrans webhook, or an admin double-click, must not pay the
// partner twice — and must not break the settle either.
func TestPartnerCommissionSurvivesConcurrentSettle(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	repo := repository.NewPartnerRepo(pool)
	p := newPartner(t, repo, 2500)

	_, storeID, subs, subID := seedReferredSeller(t, pool, repo, p.Code)
	inv, err := subs.CreatePendingInvoice(ctx, storeID, subID, 29_900_000, "bisnis", 1, "test")
	if err != nil {
		t.Fatalf("invoice: %v", err)
	}

	const racers = 8
	var wg sync.WaitGroup
	wins := make([]bool, racers)
	wg.Add(racers)
	for i := 0; i < racers; i++ {
		go func(i int) {
			defer wg.Done()
			if _, _, err := subs.SettleInvoice(ctx, inv.ID); err == nil {
				wins[i] = true
			}
		}(i)
	}
	wg.Wait()

	won := 0
	for _, w := range wins {
		if w {
			won++
		}
	}
	if won != 1 {
		t.Fatalf("invoice settled %d times, want exactly 1", won)
	}
	if n := countCommissions(t, pool, p.ID); n != 1 {
		t.Fatalf("got %d commissions from a settle race, want 1", n)
	}
}

// An unattributed customer is the normal case. It must produce no commission
// and, more importantly, no error on the money path.
func TestPartnerCommissionSkippedWhenUnattributed(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	repo := repository.NewPartnerRepo(pool)

	_, storeID, subs, subID := seedReferredSeller(t, pool, repo, "")
	inv, err := subs.CreatePendingInvoice(ctx, storeID, subID, 9_900_000, "pro", 1, "test")
	if err != nil {
		t.Fatalf("invoice: %v", err)
	}
	sub, settled, err := subs.SettleInvoice(ctx, inv.ID)
	if err != nil {
		t.Fatalf("settle failed for an unattributed store: %v", err)
	}
	if settled.Status != "paid" || sub.Plan != "pro" {
		t.Fatalf("settle did not complete: %+v", settled.Status)
	}
	var n int
	if err := pool.QueryRow(ctx,
		`SELECT count(*) FROM partner_commissions WHERE invoice_id = $1`, inv.ID).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 0 {
		t.Fatalf("unattributed store accrued %d commissions", n)
	}
}

// An admin grant moves no money, so it owes no commission.
func TestPartnerCommissionIgnoresZeroAmountInvoice(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	repo := repository.NewPartnerRepo(pool)
	p := newPartner(t, repo, 2000)

	_, storeID, subs, subID := seedReferredSeller(t, pool, repo, p.Code)
	inv, err := subs.CreatePendingInvoice(ctx, storeID, subID, 0, "bisnis", 1, "admin grant")
	if err != nil {
		t.Fatalf("invoice: %v", err)
	}
	if _, _, err := subs.SettleInvoice(ctx, inv.ID); err != nil {
		t.Fatalf("settle: %v", err)
	}
	if n := countCommissions(t, pool, p.ID); n != 0 {
		t.Fatalf("a zero-amount invoice accrued %d commissions", n)
	}
}

// Raising a partner's rate must not restate what they already earned.
func TestPartnerCommissionRateIsSnapshotted(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	repo := repository.NewPartnerRepo(pool)
	p := newPartner(t, repo, 2000)

	_, storeID, subs, subID := seedReferredSeller(t, pool, repo, p.Code)
	inv, err := subs.CreatePendingInvoice(ctx, storeID, subID, 10_000_000, "pro", 1, "test")
	if err != nil {
		t.Fatalf("invoice: %v", err)
	}
	if _, _, err := subs.SettleInvoice(ctx, inv.ID); err != nil {
		t.Fatalf("settle: %v", err)
	}
	if _, err := repo.UpdatePartner(ctx, repository.UpdatePartnerInput{
		ID: p.ID, Name: p.Name, CommissionBps: 5000, Status: "active",
	}); err != nil {
		t.Fatalf("raise rate: %v", err)
	}

	list, _, err := repo.ListCommissions(ctx, p.ID, 10, 0)
	if err != nil || len(list) != 1 {
		t.Fatalf("list: %v (%d rows)", err, len(list))
	}
	if list[0].CommissionBps != 2000 || list[0].CommissionCents != 2_000_000 {
		t.Fatalf("rate change rewrote history: bps=%d cents=%d",
			list[0].CommissionBps, list[0].CommissionCents)
	}
}

// === Void and payout ===

func TestPartnerVoidFreesTheSlot(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	repo := repository.NewPartnerRepo(pool)
	p := newPartner(t, repo, 2000)

	_, storeID, subs, subID := seedReferredSeller(t, pool, repo, p.Code)
	first, err := subs.CreatePendingInvoice(ctx, storeID, subID, 9_900_000, "pro", 1, "test")
	if err != nil {
		t.Fatalf("invoice: %v", err)
	}
	if _, _, err := subs.SettleInvoice(ctx, first.ID); err != nil {
		t.Fatalf("settle: %v", err)
	}
	list, _, _ := repo.ListCommissions(ctx, p.ID, 10, 0)
	if err := repo.VoidCommission(ctx, list[0].ID, "refund"); err != nil {
		t.Fatalf("void: %v", err)
	}

	// After a refund, the customer's next genuine payment should earn again.
	second, err := subs.CreatePendingInvoice(ctx, storeID, subID, 9_900_000, "pro", 1, "test")
	if err != nil {
		t.Fatalf("second invoice: %v", err)
	}
	if _, _, err := subs.SettleInvoice(ctx, second.ID); err != nil {
		t.Fatalf("second settle: %v", err)
	}
	if n := countCommissions(t, pool, p.ID); n != 1 {
		t.Fatalf("after void + repay, live commissions = %d, want 1", n)
	}
}

// Money that has already left cannot be un-sent by an UPDATE.
func TestPartnerVoidRefusesPaidCommission(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	repo := repository.NewPartnerRepo(pool)
	p := newPartner(t, repo, 2000)

	_, storeID, subs, subID := seedReferredSeller(t, pool, repo, p.Code)
	inv, _ := subs.CreatePendingInvoice(ctx, storeID, subID, 9_900_000, "pro", 1, "test")
	if _, _, err := subs.SettleInvoice(ctx, inv.ID); err != nil {
		t.Fatalf("settle: %v", err)
	}
	if _, err := repo.RecordPayout(ctx, repository.RecordPayoutInput{
		PartnerID: p.ID, Method: "transfer", Reference: "TRX1",
	}); err != nil {
		t.Fatalf("payout: %v", err)
	}
	list, _, _ := repo.ListCommissions(ctx, p.ID, 10, 0)
	if err := repo.VoidCommission(ctx, list[0].ID, "oops"); !errors.Is(err, repository.ErrCommissionLocked) {
		t.Fatalf("voiding a paid commission returned %v, want ErrCommissionLocked", err)
	}
}

// A double-click must not file a second, empty payout.
func TestPartnerPayoutIsIdempotent(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	repo := repository.NewPartnerRepo(pool)
	p := newPartner(t, repo, 2000)

	_, storeID, subs, subID := seedReferredSeller(t, pool, repo, p.Code)
	inv, _ := subs.CreatePendingInvoice(ctx, storeID, subID, 9_900_000, "pro", 1, "test")
	if _, _, err := subs.SettleInvoice(ctx, inv.ID); err != nil {
		t.Fatalf("settle: %v", err)
	}

	first, err := repo.RecordPayout(ctx, repository.RecordPayoutInput{
		PartnerID: p.ID, Method: "transfer", Reference: "TRX1",
	})
	if err != nil {
		t.Fatalf("first payout: %v", err)
	}
	if first.AmountCents != 1_980_000 || first.CommissionCount != 1 {
		t.Fatalf("payout totals wrong: %d over %d rows", first.AmountCents, first.CommissionCount)
	}
	if _, err := repo.RecordPayout(ctx, repository.RecordPayoutInput{
		PartnerID: p.ID, Method: "transfer", Reference: "TRX2",
	}); !errors.Is(err, repository.ErrPayoutNothingDue) {
		t.Fatalf("second payout returned %v, want ErrPayoutNothingDue", err)
	}

	list, err := repo.ListPayouts(ctx, p.ID)
	if err != nil {
		t.Fatalf("list payouts: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("got %d payout rows, want 1", len(list))
	}
}

// === Notification ===

// The partner hears about a sale exactly once, however many times the webhook
// is redelivered.
func TestPartnerNoticeClaimedOnlyOnce(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	repo := repository.NewPartnerRepo(pool)
	p := newPartner(t, repo, 2000)

	_, storeID, subs, subID := seedReferredSeller(t, pool, repo, p.Code)
	inv, _ := subs.CreatePendingInvoice(ctx, storeID, subID, 9_900_000, "pro", 1, "test")
	if _, _, err := subs.SettleInvoice(ctx, inv.ID); err != nil {
		t.Fatalf("settle: %v", err)
	}

	notice, err := repo.ClaimCommissionNotice(ctx, inv.ID)
	if err != nil {
		t.Fatalf("claim: %v", err)
	}
	if notice == nil {
		t.Fatal("first claim returned nothing")
	}
	if notice.CommissionCents != 1_980_000 || notice.TotalOwedCents != 1_980_000 {
		t.Errorf("notice figures wrong: commission=%d owed=%d",
			notice.CommissionCents, notice.TotalOwedCents)
	}
	if notice.ContactEmail == "" {
		t.Error("notice has no destination address")
	}

	again, err := repo.ClaimCommissionNotice(ctx, inv.ID)
	if err != nil {
		t.Fatalf("second claim errored: %v", err)
	}
	if again != nil {
		t.Fatal("a redelivered webhook would have emailed the partner twice")
	}
}

// The running total in the email is the sum of everything outstanding, so the
// partner's inbox and the admin page can never disagree.
func TestPartnerNoticeCarriesRunningTotal(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	repo := repository.NewPartnerRepo(pool)
	p := newPartner(t, repo, 2000)

	var last uuid.UUID
	for i := 0; i < 3; i++ {
		_, storeID, subs, subID := seedReferredSeller(t, pool, repo, p.Code)
		inv, _ := subs.CreatePendingInvoice(ctx, storeID, subID, 10_000_000, "pro", 1, "test")
		if _, _, err := subs.SettleInvoice(ctx, inv.ID); err != nil {
			t.Fatalf("settle %d: %v", i, err)
		}
		last = inv.ID
	}
	notice, err := repo.ClaimCommissionNotice(ctx, last)
	if err != nil || notice == nil {
		t.Fatalf("claim: %v (%v)", err, notice)
	}
	if want := int64(6_000_000); notice.TotalOwedCents != want {
		t.Fatalf("running total = %d, want %d (three referrals at 20%% of 100.000)",
			notice.TotalOwedCents, want)
	}
}

// A commission that was already paid out is not announced again.
func TestPartnerNoticeSkippedAfterPayout(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	repo := repository.NewPartnerRepo(pool)
	p := newPartner(t, repo, 2000)

	_, storeID, subs, subID := seedReferredSeller(t, pool, repo, p.Code)
	inv, _ := subs.CreatePendingInvoice(ctx, storeID, subID, 9_900_000, "pro", 1, "test")
	if _, _, err := subs.SettleInvoice(ctx, inv.ID); err != nil {
		t.Fatalf("settle: %v", err)
	}
	if _, err := repo.RecordPayout(ctx, repository.RecordPayoutInput{
		PartnerID: p.ID, Method: "transfer",
	}); err != nil {
		t.Fatalf("payout: %v", err)
	}
	notice, err := repo.ClaimCommissionNotice(ctx, inv.ID)
	if err != nil {
		t.Fatalf("claim: %v", err)
	}
	if notice != nil {
		t.Fatal("a settled commission was queued for notification")
	}
}

// === Delete ===

// A partner registered by mistake — wrong code, duplicate, a test — should be
// removable. Nothing has happened yet, so nothing is lost.
func TestPartnerDeleteRemovesAnUnusedPartner(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	repo := repository.NewPartnerRepo(pool)
	p := newPartner(t, repo, 2000)

	if err := repo.DeletePartner(ctx, p.ID); err != nil {
		t.Fatalf("delete an unused partner: %v", err)
	}
	if _, err := repo.FindPartnerByID(ctx, p.ID); !errors.Is(err, repository.ErrPartnerNotFound) {
		t.Fatalf("partner still present after delete (%v)", err)
	}
}

// The important half. Once someone signed up through the link, the row is a
// record of who is owed what — deleting it would erase the evidence behind a
// payout, and the FKs would refuse anyway.
func TestPartnerDeleteRefusedOnceSomeoneSignedUp(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	repo := repository.NewPartnerRepo(pool)
	p := newPartner(t, repo, 2000)

	seedReferredSeller(t, pool, repo, p.Code)

	if err := repo.DeletePartner(ctx, p.ID); !errors.Is(err, repository.ErrPartnerHasHistory) {
		t.Fatalf("delete returned %v, want ErrPartnerHasHistory", err)
	}
	if _, err := repo.FindPartnerByID(ctx, p.ID); err != nil {
		t.Fatalf("partner was damaged by a refused delete: %v", err)
	}
}

// A commission outlives its referral row only in theory today, but the guard
// checks commissions and payouts independently so a future change to the
// referral table cannot quietly open a hole in the money history.
func TestPartnerDeleteRefusedWhenCommissionsExist(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	repo := repository.NewPartnerRepo(pool)
	p := newPartner(t, repo, 2000)

	_, storeID, subs, subID := seedReferredSeller(t, pool, repo, p.Code)
	inv, err := subs.CreatePendingInvoice(ctx, storeID, subID, 9_900_000, "pro", 1, "test")
	if err != nil {
		t.Fatalf("invoice: %v", err)
	}
	if _, _, err := subs.SettleInvoice(ctx, inv.ID); err != nil {
		t.Fatalf("settle: %v", err)
	}

	// Drop the referral, leaving the commission behind: the delete must still
	// refuse, because the money row is the thing worth protecting.
	if _, err := pool.Exec(ctx,
		`UPDATE partner_commissions SET referral_id = NULL WHERE partner_id = $1`, p.ID); err != nil {
		t.Fatalf("detach referral: %v", err)
	}
	if _, err := pool.Exec(ctx,
		`DELETE FROM partner_referrals WHERE partner_id = $1`, p.ID); err != nil {
		t.Fatalf("delete referrals: %v", err)
	}

	if err := repo.DeletePartner(ctx, p.ID); !errors.Is(err, repository.ErrPartnerHasHistory) {
		t.Fatalf("delete returned %v, want ErrPartnerHasHistory", err)
	}
	if n := countCommissions(t, pool, p.ID); n != 1 {
		t.Fatalf("commission count = %d after a refused delete, want 1", n)
	}
}

// Deleting an unknown id is not a crash and not a success.
func TestPartnerDeleteUnknownID(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	repo := repository.NewPartnerRepo(pool)
	if err := repo.DeletePartner(context.Background(), uuid.New()); !errors.Is(err, repository.ErrPartnerHasHistory) {
		t.Fatalf("unknown id returned %v, want the guarded no-op error", err)
	}
}
