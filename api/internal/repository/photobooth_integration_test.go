package repository_test

// Money-path guards for PhotoBoost, against a real Postgres.
// Skipped unless TEST_DATABASE_URL is set.
//
//   docker run -d --name pg-test -e POSTGRES_USER=sellon -e POSTGRES_PASSWORD=sellon \
//     -e POSTGRES_DB=sellon_test -p 55432:5432 postgres:16-alpine
//   TEST_DATABASE_URL='postgres://sellon:sellon@localhost:55432/sellon_test?sslmode=disable' \
//     go test ./internal/repository/ -run PhotoBooth -v
//
// These exist because a photo booth runs unattended: there is nobody standing
// beside it to notice that one payment settled twice, or that a retry minted a
// second charge. Every assertion here is a failure mode that would otherwise
// be discovered from a customer complaint.

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

func pbRepos(t *testing.T) (*pgxpool.Pool, *repository.PhotoBoothRepo, *repository.PhotoBoothSessionRepo) {
	t.Helper()
	pool := testPool(t)
	return pool, repository.NewPhotoBoothRepo(pool), repository.NewPhotoBoothSessionRepo(pool)
}

// freshBooth makes a booth with a code unique to this test run, so repeated
// runs against the same database don't collide.
func freshBooth(t *testing.T, repo *repository.PhotoBoothRepo) *repository.Booth {
	t.Helper()
	code := fmt.Sprintf("T%05d", uuid.New().ID()%100000)
	b, err := repo.CreateBooth(context.Background(), repository.CreateBoothInput{
		Code: code, Name: "Test Booth " + code,
	})
	if err != nil {
		t.Fatalf("create booth: %v", err)
	}
	return b
}

func newSession(t *testing.T, sessions *repository.PhotoBoothSessionRepo, b *repository.Booth, idem string) *repository.PhotoBoothSession {
	t.Helper()
	s, _, err := sessions.CreateSession(context.Background(), repository.CreateSessionInput{
		BoothID: b.ID, BoothCode: b.Code, IdempotencyKey: idem,
		AmountCents: 2500000, ShotsPlanned: 4, PrintCopies: 1,
	})
	if err != nil {
		t.Fatalf("create session: %v", err)
	}
	return s
}

// A replayed idempotency key must return the ORIGINAL session, not a second
// one. Two sessions would mean two QRIS charges for one customer.
func TestPhotoBoothCreateSessionIsIdempotent(t *testing.T) {
	_, booths, sessions := pbRepos(t)
	ctx := context.Background()
	b := freshBooth(t, booths)
	key := "idem-" + uuid.NewString()

	first := newSession(t, sessions, b, key)

	second, replayed, err := sessions.CreateSession(ctx, repository.CreateSessionInput{
		BoothID: b.ID, BoothCode: b.Code, IdempotencyKey: key,
		AmountCents: 2500000, ShotsPlanned: 4, PrintCopies: 1,
	})
	if err != nil {
		t.Fatalf("replay create: %v", err)
	}
	if !replayed {
		t.Error("replayed = false; the caller cannot tell a replay from a new session")
	}
	if second.ID != first.ID {
		t.Fatalf("replay minted a second session: %s != %s", second.ID, first.ID)
	}
}

// Sessions without an idempotency key must not collide with each other — the
// unique index is partial for exactly this reason.
func TestPhotoBoothCreateSessionWithoutKeyDoesNotCollide(t *testing.T) {
	_, booths, sessions := pbRepos(t)
	b := freshBooth(t, booths)

	a := newSession(t, sessions, b, "")
	c := newSession(t, sessions, b, "")
	if a.ID == c.ID {
		t.Fatal("two keyless sessions collapsed into one")
	}
}

// Only one of N concurrent charge attempts may claim the right to call
// Midtrans. The loser must be told, not silently allowed through — Midtrans
// rejects a second charge on the same order_id, and by then the customer is
// already looking at a QR.
func TestPhotoBoothClaimForChargeIsExclusive(t *testing.T) {
	_, booths, sessions := pbRepos(t)
	ctx := context.Background()
	b := freshBooth(t, booths)
	s := newSession(t, sessions, b, "idem-"+uuid.NewString())

	const n = 8
	var wg sync.WaitGroup
	won := make([]bool, n)
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, err := sessions.ClaimForCharge(ctx, b.ID, s.SessionNumber, s.SessionNumber)
			won[i] = err == nil
		}(i)
	}
	wg.Wait()

	winners := 0
	for _, w := range won {
		if w {
			winners++
		}
	}
	if winners != 1 {
		t.Fatalf("%d concurrent claims succeeded, want exactly 1", winners)
	}
}

// Releasing a claim must let the booth try again — otherwise a transient
// Midtrans error strands a paying customer forever.
func TestPhotoBoothReleaseClaimAllowsRetry(t *testing.T) {
	_, booths, sessions := pbRepos(t)
	ctx := context.Background()
	b := freshBooth(t, booths)
	s := newSession(t, sessions, b, "idem-"+uuid.NewString())

	claimed, err := sessions.ClaimForCharge(ctx, b.ID, s.SessionNumber, s.SessionNumber)
	if err != nil {
		t.Fatalf("first claim: %v", err)
	}
	if _, err := sessions.ClaimForCharge(ctx, b.ID, s.SessionNumber, s.SessionNumber); !errors.Is(err, repository.ErrSessionNotChargeable) {
		t.Fatalf("second claim err = %v, want ErrSessionNotChargeable", err)
	}
	if err := sessions.ReleaseChargeClaim(ctx, claimed.ID); err != nil {
		t.Fatalf("release: %v", err)
	}
	if _, err := sessions.ClaimForCharge(ctx, b.ID, s.SessionNumber, s.SessionNumber); err != nil {
		t.Fatalf("claim after release: %v", err)
	}
}

// The core guarantee: concurrent settles (webhook + poll reconcile firing at
// once) must settle the money exactly once.
func TestPhotoBoothSettleIsExactlyOnce(t *testing.T) {
	_, booths, sessions := pbRepos(t)
	ctx := context.Background()
	b := freshBooth(t, booths)
	s := newSession(t, sessions, b, "idem-"+uuid.NewString())

	const n = 10
	var wg sync.WaitGroup
	settled := make([]bool, n)
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, err := sessions.SetSessionPaidGuarded(ctx, s.ID, "txn-123")
			settled[i] = err == nil
		}(i)
	}
	wg.Wait()

	wins := 0
	for _, ok := range settled {
		if ok {
			wins++
		}
	}
	if wins != 1 {
		t.Fatalf("%d concurrent settles succeeded, want exactly 1", wins)
	}

	after, err := sessions.FindByNumberForBooth(ctx, b.ID, s.SessionNumber)
	if err != nil {
		t.Fatal(err)
	}
	if after.PaymentStatus != "paid" || after.Status != "paid" {
		t.Errorf("after settle: status=%s payment=%s, want paid/paid", after.Status, after.PaymentStatus)
	}
	if after.PaidAt == nil {
		t.Error("paid_at not stamped")
	}
}

// A redelivered webhook must be inert.
func TestPhotoBoothSettleReplayIsRejected(t *testing.T) {
	_, booths, sessions := pbRepos(t)
	ctx := context.Background()
	b := freshBooth(t, booths)
	s := newSession(t, sessions, b, "idem-"+uuid.NewString())

	if _, err := sessions.SetSessionPaidGuarded(ctx, s.ID, "txn-1"); err != nil {
		t.Fatalf("first settle: %v", err)
	}
	_, err := sessions.SetSessionPaidGuarded(ctx, s.ID, "txn-1")
	if !errors.Is(err, repository.ErrSessionPaymentUnchanged) {
		t.Fatalf("replay err = %v, want ErrSessionPaymentUnchanged", err)
	}
}

// 'refunded' is terminal. A late settlement must never flip it back to paid:
// that would read as revenue and block any further refund.
func TestPhotoBoothSettleAfterRefundIsRejected(t *testing.T) {
	pool, booths, sessions := pbRepos(t)
	ctx := context.Background()
	b := freshBooth(t, booths)
	s := newSession(t, sessions, b, "idem-"+uuid.NewString())

	if _, err := pool.Exec(ctx, `
		UPDATE photobooth_sessions
		SET payment_status = 'refunded', status = 'refunded', refunded_at = now()
		WHERE id = $1`, s.ID); err != nil {
		t.Fatal(err)
	}

	_, err := sessions.SetSessionPaidGuarded(ctx, s.ID, "late-txn")
	if !errors.Is(err, repository.ErrSessionPaymentUnchanged) {
		t.Fatalf("settle after refund err = %v, want ErrSessionPaymentUnchanged", err)
	}

	after, err := sessions.FindByNumberForBooth(ctx, b.ID, s.SessionNumber)
	if err != nil {
		t.Fatal(err)
	}
	if after.PaymentStatus != "refunded" {
		t.Fatalf("payment_status = %s, want refunded to be preserved", after.PaymentStatus)
	}
}

// A customer who paid just after the booth gave up HAS paid. The session must
// settle, keep its terminal status, and raise the review flag so a human sees
// it — silently discarding the payment is the one unacceptable outcome.
func TestPhotoBoothSettleAfterExpiryFlagsReview(t *testing.T) {
	_, booths, sessions := pbRepos(t)
	ctx := context.Background()
	b := freshBooth(t, booths)
	s := newSession(t, sessions, b, "idem-"+uuid.NewString())

	if err := sessions.MarkExpired(ctx, s.ID); err != nil {
		t.Fatalf("expire: %v", err)
	}

	change, err := sessions.SetSessionPaidGuarded(ctx, s.ID, "late-txn")
	if err != nil {
		t.Fatalf("late settle should succeed, got %v", err)
	}
	if !change.WasExpired {
		t.Error("WasExpired = false; the caller cannot tell this needs attention")
	}

	after, err := sessions.FindByNumberForBooth(ctx, b.ID, s.SessionNumber)
	if err != nil {
		t.Fatal(err)
	}
	if after.PaymentStatus != "paid" {
		t.Errorf("payment_status = %s, want paid — the money really did arrive", after.PaymentStatus)
	}
	if after.Status != "expired" {
		t.Errorf("status = %s, want the terminal status preserved", after.Status)
	}
	if !after.NeedsReview {
		t.Error("needs_review = false; a paid-after-expiry session must surface to ops")
	}
}

// MarkExpired must not clobber a settlement that landed microseconds earlier.
func TestPhotoBoothExpiryDoesNotClobberPaid(t *testing.T) {
	_, booths, sessions := pbRepos(t)
	ctx := context.Background()
	b := freshBooth(t, booths)
	s := newSession(t, sessions, b, "idem-"+uuid.NewString())

	if _, err := sessions.SetSessionPaidGuarded(ctx, s.ID, "txn-1"); err != nil {
		t.Fatal(err)
	}
	if err := sessions.MarkExpired(ctx, s.ID); err != nil {
		t.Fatal(err)
	}
	after, err := sessions.FindByNumberForBooth(ctx, b.ID, s.SessionNumber)
	if err != nil {
		t.Fatal(err)
	}
	if after.PaymentStatus != "paid" {
		t.Fatalf("payment_status = %s after expiry ran on a paid session, want paid", after.PaymentStatus)
	}
}

// Capture progress is monotonic and clamped: a retried or out-of-order report
// must not walk the counter backwards, and no booth may claim more shots than
// the customer paid for.
func TestPhotoBoothShotsAreMonotonicAndClamped(t *testing.T) {
	_, booths, sessions := pbRepos(t)
	ctx := context.Background()
	b := freshBooth(t, booths)
	s := newSession(t, sessions, b, "idem-"+uuid.NewString())
	if _, err := sessions.SetSessionPaidGuarded(ctx, s.ID, "txn-1"); err != nil {
		t.Fatal(err)
	}

	if _, err := sessions.SetShotsTaken(ctx, b.ID, s.SessionNumber, 3); err != nil {
		t.Fatal(err)
	}
	got, err := sessions.SetShotsTaken(ctx, b.ID, s.SessionNumber, 1) // stale retry
	if err != nil {
		t.Fatal(err)
	}
	if got.ShotsTaken != 3 {
		t.Errorf("shots_taken = %d after a stale report, want 3", got.ShotsTaken)
	}
	got, err = sessions.SetShotsTaken(ctx, b.ID, s.SessionNumber, 99)
	if err != nil {
		t.Fatal(err)
	}
	if got.ShotsTaken != 4 {
		t.Errorf("shots_taken = %d, want clamping to the 4 shots that were paid for", got.ShotsTaken)
	}
}

// Shots and completion are only meaningful on a paid session. An unpaid booth
// reporting progress is either a bug or an attempt to get free prints.
func TestPhotoBoothShotsRejectedWhenUnpaid(t *testing.T) {
	_, booths, sessions := pbRepos(t)
	ctx := context.Background()
	b := freshBooth(t, booths)
	s := newSession(t, sessions, b, "idem-"+uuid.NewString())

	if _, err := sessions.SetShotsTaken(ctx, b.ID, s.SessionNumber, 1); !errors.Is(err, repository.ErrSessionNotPaid) {
		t.Fatalf("err = %v, want ErrSessionNotPaid", err)
	}
}

// A failed print must flag review: the customer paid and got nothing.
func TestPhotoBoothFailedPrintFlagsReview(t *testing.T) {
	_, booths, sessions := pbRepos(t)
	ctx := context.Background()
	b := freshBooth(t, booths)
	s := newSession(t, sessions, b, "idem-"+uuid.NewString())
	if _, err := sessions.SetSessionPaidGuarded(ctx, s.ID, "txn-1"); err != nil {
		t.Fatal(err)
	}

	out, err := sessions.Complete(ctx, repository.CompleteSessionInput{
		BoothID: b.ID, Number: s.SessionNumber, Succeeded: false,
		FailureReason: "kertas habis",
	})
	if err != nil {
		t.Fatal(err)
	}
	if out.Status != "failed" {
		t.Errorf("status = %s, want failed", out.Status)
	}
	if !out.NeedsReview {
		t.Error("needs_review = false; a paid-but-unprinted session must reach a human")
	}
	if out.CompletedAt == nil {
		t.Error("completed_at not stamped on a failure")
	}
}

// One booth must never be able to read or drive another booth's session.
func TestPhotoBoothSessionIsScopedToItsBooth(t *testing.T) {
	_, booths, sessions := pbRepos(t)
	ctx := context.Background()
	mine := freshBooth(t, booths)
	theirs := freshBooth(t, booths)
	s := newSession(t, sessions, mine, "idem-"+uuid.NewString())

	if _, err := sessions.FindByNumberForBooth(ctx, theirs.ID, s.SessionNumber); !errors.Is(err, repository.ErrSessionNotFound) {
		t.Fatalf("cross-booth read err = %v, want ErrSessionNotFound", err)
	}
	if _, err := sessions.ClaimForCharge(ctx, theirs.ID, s.SessionNumber, s.SessionNumber); !errors.Is(err, repository.ErrSessionNotChargeable) {
		t.Fatalf("cross-booth claim err = %v, want rejection", err)
	}
}

// Config resolution: NULL means inherit, a value means override. Getting this
// backwards would either freeze every booth at the seeded price or silently
// ignore a booth's own pricing.
func TestPhotoBoothEffectiveConfigInherits(t *testing.T) {
	_, booths, _ := pbRepos(t)
	ctx := context.Background()
	b := freshBooth(t, booths)

	defaults, err := booths.GetSettings(ctx)
	if err != nil {
		t.Fatal(err)
	}
	cfg, err := booths.EffectiveConfigFor(ctx, b.ID)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.PriceCents != defaults.PriceCents {
		t.Errorf("inherited price = %d, want the platform default %d", cfg.PriceCents, defaults.PriceCents)
	}

	override := int64(5000000)
	if _, err := booths.UpdateBooth(ctx, repository.UpdateBoothInput{
		ID: b.ID, Name: b.Name, Status: "active", PriceCents: &override,
	}); err != nil {
		t.Fatal(err)
	}
	cfg, err = booths.EffectiveConfigFor(ctx, b.ID)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.PriceCents != override {
		t.Errorf("overridden price = %d, want %d", cfg.PriceCents, override)
	}
	if cfg.ShotsCount != defaults.ShotsCount {
		t.Errorf("shots = %d, want the untouched field to still inherit %d", cfg.ShotsCount, defaults.ShotsCount)
	}
}

// A device token must authenticate exactly once it exists, stop the moment it
// is revoked, and stop when its booth is paused.
func TestPhotoBoothDeviceTokenLifecycle(t *testing.T) {
	_, booths, _ := pbRepos(t)
	ctx := context.Background()
	b := freshBooth(t, booths)

	raw, tok, err := booths.IssueDeviceToken(ctx, b.ID, "tablet-1", uuid.Nil)
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	auth, err := booths.FindActiveBoothByTokenHash(ctx, repository.HashDeviceToken(raw))
	if err != nil {
		t.Fatalf("authenticate: %v", err)
	}
	if auth.Booth.ID != b.ID || auth.TokenID != tok.ID {
		t.Fatal("authenticated the wrong booth/token")
	}

	// Pausing a booth must take its tablets offline without revoking tokens.
	if _, err := booths.UpdateBooth(ctx, repository.UpdateBoothInput{
		ID: b.ID, Name: b.Name, Status: "paused",
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := booths.FindActiveBoothByTokenHash(ctx, repository.HashDeviceToken(raw)); !errors.Is(err, repository.ErrDeviceTokenInvalid) {
		t.Errorf("paused booth err = %v, want ErrDeviceTokenInvalid", err)
	}
	if _, err := booths.UpdateBooth(ctx, repository.UpdateBoothInput{
		ID: b.ID, Name: b.Name, Status: "active",
	}); err != nil {
		t.Fatal(err)
	}

	if err := booths.RevokeDeviceToken(ctx, tok.ID, uuid.Nil); err != nil {
		t.Fatal(err)
	}
	if _, err := booths.FindActiveBoothByTokenHash(ctx, repository.HashDeviceToken(raw)); !errors.Is(err, repository.ErrDeviceTokenInvalid) {
		t.Errorf("revoked token err = %v, want ErrDeviceTokenInvalid", err)
	}
}

// Two live tokens at once is the property that makes rotation safe.
func TestPhotoBoothTokenRotationOverlaps(t *testing.T) {
	_, booths, _ := pbRepos(t)
	ctx := context.Background()
	b := freshBooth(t, booths)

	oldRaw, oldTok, err := booths.IssueDeviceToken(ctx, b.ID, "old", uuid.Nil)
	if err != nil {
		t.Fatal(err)
	}
	newRaw, _, err := booths.IssueDeviceToken(ctx, b.ID, "new", uuid.Nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, raw := range []string{oldRaw, newRaw} {
		if _, err := booths.FindActiveBoothByTokenHash(ctx, repository.HashDeviceToken(raw)); err != nil {
			t.Fatalf("both tokens must work during rotation: %v", err)
		}
	}
	if err := booths.RevokeDeviceToken(ctx, oldTok.ID, uuid.Nil); err != nil {
		t.Fatal(err)
	}
	if _, err := booths.FindActiveBoothByTokenHash(ctx, repository.HashDeviceToken(newRaw)); err != nil {
		t.Fatalf("new token must survive revoking the old one: %v", err)
	}
}

// The raw token must never be derivable from what we store.
func TestPhotoBoothTokenIsNotStoredRaw(t *testing.T) {
	pool, booths, _ := pbRepos(t)
	ctx := context.Background()
	b := freshBooth(t, booths)

	raw, tok, err := booths.IssueDeviceToken(ctx, b.ID, "tablet", uuid.Nil)
	if err != nil {
		t.Fatal(err)
	}
	var hash, prefix string
	if err := pool.QueryRow(ctx,
		`SELECT token_hash, token_prefix FROM photobooth_device_tokens WHERE id = $1`,
		tok.ID).Scan(&hash, &prefix); err != nil {
		t.Fatal(err)
	}
	if hash == raw {
		t.Fatal("the raw token was stored verbatim")
	}
	if len(prefix) >= len(raw) {
		t.Fatalf("prefix %q is not a prefix, it is the whole token", prefix)
	}
}

// === Pairing ===

// A pairing code is a bearer credential for the fifteen minutes it lives, and
// redeeming it mints a token that can charge real money. Two tablets racing on
// one code must therefore produce exactly one token — otherwise a stranger who
// shoulder-read the code off the admin's screen ends up authenticated as the
// booth alongside the real one.
func TestPhotoBoothPairingCodeIsSingleUseUnderRace(t *testing.T) {
	ctx := context.Background()
	_, repo, _ := pbRepos(t)
	booth := freshBooth(t, repo)

	pc, err := repo.CreatePairingCode(ctx, booth.ID, "Tablet A", uuid.Nil)
	if err != nil {
		t.Fatalf("create pairing code: %v", err)
	}

	const racers = 8
	var wg sync.WaitGroup
	tokens := make([]string, racers)
	errs := make([]error, racers)
	wg.Add(racers)
	for i := 0; i < racers; i++ {
		go func(i int) {
			defer wg.Done()
			tokens[i], _, errs[i] = repo.RedeemPairingCode(ctx, pc.Code, "racer")
		}(i)
	}
	wg.Wait()

	won := 0
	for i := range tokens {
		switch {
		case errs[i] == nil:
			won++
			if tokens[i] == "" {
				t.Error("redeem succeeded but returned an empty token")
			}
		case errors.Is(errs[i], repository.ErrPairingCodeInvalid):
			// Expected: the losers.
		default:
			t.Fatalf("unexpected redeem error: %v", errs[i])
		}
	}
	if won != 1 {
		t.Fatalf("pairing code redeemed %d times, want exactly 1", won)
	}
}

// A redeemed code stays dead. The booth keeps working; the code does not.
func TestPhotoBoothPairingCodeRejectsReplay(t *testing.T) {
	ctx := context.Background()
	_, repo, _ := pbRepos(t)
	booth := freshBooth(t, repo)

	pc, err := repo.CreatePairingCode(ctx, booth.ID, "", uuid.Nil)
	if err != nil {
		t.Fatalf("create pairing code: %v", err)
	}
	if _, _, err := repo.RedeemPairingCode(ctx, pc.Code, "tablet"); err != nil {
		t.Fatalf("first redeem: %v", err)
	}
	if _, _, err := repo.RedeemPairingCode(ctx, pc.Code, "tablet"); !errors.Is(err, repository.ErrPairingCodeInvalid) {
		t.Fatalf("replay returned %v, want ErrPairingCodeInvalid", err)
	}
	if got, err := repo.ActivePairingCodeFor(ctx, booth.ID); err != nil || got != nil {
		t.Fatalf("redeemed code still listed as active (%v, %v)", got, err)
	}
}

// Issuing a second code retires the first. An admin who clicks twice because
// the dialog scrolled must not leave two live credentials behind.
func TestPhotoBoothPairingCodeSupersedesPrevious(t *testing.T) {
	ctx := context.Background()
	_, repo, _ := pbRepos(t)
	booth := freshBooth(t, repo)

	first, err := repo.CreatePairingCode(ctx, booth.ID, "", uuid.Nil)
	if err != nil {
		t.Fatalf("first code: %v", err)
	}
	second, err := repo.CreatePairingCode(ctx, booth.ID, "", uuid.Nil)
	if err != nil {
		t.Fatalf("second code: %v", err)
	}
	if first.Code == second.Code {
		t.Fatal("second code equals the first")
	}
	if _, _, err := repo.RedeemPairingCode(ctx, first.Code, "tablet"); !errors.Is(err, repository.ErrPairingCodeInvalid) {
		t.Fatalf("superseded code redeemed with %v, want ErrPairingCodeInvalid", err)
	}
	if _, _, err := repo.RedeemPairingCode(ctx, second.Code, "tablet"); err != nil {
		t.Fatalf("current code failed to redeem: %v", err)
	}
}

// A paused booth is one an operator deliberately took out of service. Pairing
// a tablet to it would put it back in service without anyone saying so.
func TestPhotoBoothPairingRefusesInactiveBooth(t *testing.T) {
	ctx := context.Background()
	pool, repo, _ := pbRepos(t)
	booth := freshBooth(t, repo)

	pc, err := repo.CreatePairingCode(ctx, booth.ID, "", uuid.Nil)
	if err != nil {
		t.Fatalf("create pairing code: %v", err)
	}
	if _, err := pool.Exec(ctx,
		`UPDATE photobooth_booths SET status = 'paused' WHERE id = $1`, booth.ID); err != nil {
		t.Fatalf("pause booth: %v", err)
	}
	if _, _, err := repo.RedeemPairingCode(ctx, pc.Code, "tablet"); !errors.Is(err, repository.ErrPairingCodeInvalid) {
		t.Fatalf("paused booth paired with %v, want ErrPairingCodeInvalid", err)
	}
}

// The token a redemption hands back must actually authenticate, and must
// authenticate as the booth the code belonged to. A pairing flow that returns
// a token the middleware then rejects fails at the booth, in front of a
// customer, with no diagnosis available on site.
func TestPhotoBoothPairingTokenAuthenticates(t *testing.T) {
	ctx := context.Background()
	_, repo, _ := pbRepos(t)
	booth := freshBooth(t, repo)

	pc, err := repo.CreatePairingCode(ctx, booth.ID, "Tablet depan", uuid.Nil)
	if err != nil {
		t.Fatalf("create pairing code: %v", err)
	}
	raw, paired, err := repo.RedeemPairingCode(ctx, pc.Code, "")
	if err != nil {
		t.Fatalf("redeem: %v", err)
	}
	if paired.ID != booth.ID {
		t.Fatalf("paired to booth %s, want %s", paired.Code, booth.Code)
	}

	auth, err := repo.FindActiveBoothByTokenHash(ctx, repository.HashDeviceToken(raw))
	if err != nil {
		t.Fatalf("issued token does not authenticate: %v", err)
	}
	if auth.Booth.ID != booth.ID {
		t.Fatalf("token authenticated as booth %s, want %s", auth.Booth.Code, booth.Code)
	}

	// Revoking is how an admin un-pairs a lost tablet; the device must lose
	// access immediately rather than at some expiry.
	if err := repo.RevokeDeviceToken(ctx, auth.TokenID, uuid.Nil); err != nil {
		t.Fatalf("revoke: %v", err)
	}
	if _, err := repo.FindActiveBoothByTokenHash(ctx, repository.HashDeviceToken(raw)); !errors.Is(err, repository.ErrDeviceTokenInvalid) {
		t.Fatalf("revoked token still authenticates (%v)", err)
	}
}
