package repository_test

// Integration tests for two auth-hardening invariants, against a real
// Postgres (per CLAUDE.md: prefer integration tests over mocking the DB).
// Skipped unless TEST_DATABASE_URL is set.
//
//   TEST_DATABASE_URL='postgres://sellon:sellon@localhost:55433/sellon_test' \
//     go test ./internal/repository/ -run AuthHardening -v

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	"github.com/sellon/sellon/api/internal/repository"
)

// backdateVerification ages the row so the next RequestCode isn't rejected by
// the 60-second send cooldown — the real attacker just waits.
func backdateVerification(t *testing.T, pool *pgxpool.Pool, userID uuid.UUID, interval string) {
	t.Helper()
	if _, err := pool.Exec(context.Background(),
		`UPDATE email_verifications SET last_sent_at = now() - $2::interval WHERE user_id = $1`,
		userID, interval); err != nil {
		t.Fatalf("backdate last_sent_at: %v", err)
	}
}

// expireVerification makes the live claim lapse, as 15 minutes of real time
// would.
func expireVerification(t *testing.T, pool *pgxpool.Pool, userID uuid.UUID) {
	t.Helper()
	if _, err := pool.Exec(context.Background(),
		`UPDATE email_verifications
		 SET expires_at = now() - interval '1 minute', last_sent_at = now() - interval '5 minutes'
		 WHERE user_id = $1`, userID); err != nil {
		t.Fatalf("expire verification: %v", err)
	}
}

var errApplyBoom = errors.New("apply rejected the submitted password")

// A failing apply callback must NOT refund the attempt. VerifyEmail's apply
// rejects a password that doesn't match the parked claim, so if the counter
// rolled back with the transaction, a caller holding a valid code could guess
// the registrant's password forever while the code stayed alive.
func TestAuthHardeningAttemptSurvivesApplyFailure(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	users := repository.NewUserRepo(pool)
	verifs := repository.NewEmailVerificationRepo(pool)

	u, err := users.CreateWithPassword(ctx, "applyfail-"+randSuffix()+"@example.com", "Apply Fail", "")
	if err != nil {
		t.Fatal(err)
	}
	code, err := verifs.RequestCode(ctx, u.ID, repository.PurposeVerifyEmail,
		&repository.PendingClaim{PasswordHash: hashOf(t, "Correct1"), Name: "Owner"})
	if err != nil {
		t.Fatal(err)
	}

	fail := func(context.Context, pgx.Tx, repository.PendingClaim) error { return errApplyBoom }

	evaluated := 0
	var last error
	for i := 0; i < 12; i++ {
		last = verifs.Consume(ctx, u.ID, repository.PurposeVerifyEmail, code, fail)
		if errors.Is(last, errApplyBoom) {
			evaluated++
			continue
		}
		break
	}
	if evaluated > 5 {
		t.Fatalf("attempt counter refunded on apply failure: %d guesses evaluated (max 5) — unbounded brute force", evaluated)
	}
	if !errors.Is(last, repository.ErrVerificationLocked) {
		t.Fatalf("expected lockout after the attempt budget, got %v (evaluated=%d)", last, evaluated)
	}
	t.Logf("evaluated=%d before lockout", evaluated)
}

// The other half of the same trade-off: counting the attempt must not also
// burn the code. A transient DB error inside apply costs one of five tries,
// never the whole verification.
func TestAuthHardeningApplyFailureKeepsCodeUsable(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	users := repository.NewUserRepo(pool)
	verifs := repository.NewEmailVerificationRepo(pool)

	u, err := users.CreateWithPassword(ctx, "transient-"+randSuffix()+"@example.com", "Transient", "")
	if err != nil {
		t.Fatal(err)
	}
	ownerHash := hashOf(t, "Correct1")
	code, err := verifs.RequestCode(ctx, u.ID, repository.PurposeVerifyEmail,
		&repository.PendingClaim{PasswordHash: ownerHash, Name: "Owner"})
	if err != nil {
		t.Fatal(err)
	}

	if err := verifs.Consume(ctx, u.ID, repository.PurposeVerifyEmail, code,
		func(context.Context, pgx.Tx, repository.PendingClaim) error { return errApplyBoom },
	); !errors.Is(err, errApplyBoom) {
		t.Fatalf("expected the apply error to surface, got %v", err)
	}

	if err := verifs.Consume(ctx, u.ID, repository.PurposeVerifyEmail, code,
		func(ctx context.Context, tx pgx.Tx, c repository.PendingClaim) error {
			return users.FinalizeVerificationTx(ctx, tx, u.ID, c.PasswordHash, c.Name)
		}); err != nil {
		t.Fatalf("a transient apply failure burned the code: %v", err)
	}
	got, err := users.FindByID(ctx, u.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.PasswordHash != ownerHash {
		t.Fatal("retry after a failed apply did not install the parked password")
	}
}

// Registration griefing: an attacker POSTing /auth/register for a stranger's
// address must not be able to replace the pending claim the real owner is in
// the middle of proving. Every code goes to the owner's mailbox, so the only
// thing an overwrite achieves is making the owner's own password stop
// matching — indefinitely, on repeat.
func TestAuthHardeningLivePendingClaimIsNotHijacked(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	users := repository.NewUserRepo(pool)
	verifs := repository.NewEmailVerificationRepo(pool)

	u, err := users.CreateWithPassword(ctx, "grief-"+randSuffix()+"@example.com", "", "")
	if err != nil {
		t.Fatal(err)
	}

	victimHash := hashOf(t, "VictimPw1")
	if _, err := verifs.RequestCode(ctx, u.ID, repository.PurposeVerifyEmail,
		&repository.PendingClaim{PasswordHash: victimHash, Name: "Victim"}); err != nil {
		t.Fatal(err)
	}

	// The attacker waits out the send cooldown and re-registers, twice.
	for i := 0; i < 2; i++ {
		backdateVerification(t, pool, u.ID, "2 minutes")
		if _, err := verifs.RequestCode(ctx, u.ID, repository.PurposeVerifyEmail,
			&repository.PendingClaim{PasswordHash: hashOf(t, "Attacker1"), Name: "Attacker"}); err != nil {
			t.Fatalf("re-register %d must stay indistinguishable from a normal one, got %v", i, err)
		}
	}

	claim, ok, err := verifs.PendingClaim(ctx, u.ID, repository.PurposeVerifyEmail)
	if err != nil {
		t.Fatal(err)
	}
	if !ok {
		t.Fatal("the victim's pending claim disappeared")
	}
	if claim.PasswordHash != victimHash || claim.Name != "Victim" {
		t.Fatal("attacker overwrote the live pending claim — the victim can never finish signing up")
	}

	// The latest code (which lands in the victim's mailbox) plus the victim's
	// own password must still complete the signup.
	backdateVerification(t, pool, u.ID, "2 minutes")
	code, err := verifs.RequestCode(ctx, u.ID, repository.PurposeVerifyEmail, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := verifs.Consume(ctx, u.ID, repository.PurposeVerifyEmail, code,
		func(ctx context.Context, tx pgx.Tx, c repository.PendingClaim) error {
			if bcrypt.CompareHashAndPassword([]byte(c.PasswordHash), []byte("VictimPw1")) != nil {
				return errApplyBoom
			}
			return users.FinalizeVerificationTx(ctx, tx, u.ID, c.PasswordHash, c.Name)
		}); err != nil {
		t.Fatalf("victim could not complete their own signup: %v", err)
	}
	got, err := users.FindByID(ctx, u.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Name != "Victim" || got.PasswordHash != victimHash {
		t.Fatalf("wrong claim landed on the account: name=%q", got.Name)
	}
}

// The hold must be a bounded rate limit, not a permanent lock: once the claim
// lapses, a squatter no longer owns the address and the real owner's
// re-registration wins, as migration 0097 intends.
func TestAuthHardeningClaimHoldLapsesWithTheCode(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	users := repository.NewUserRepo(pool)
	verifs := repository.NewEmailVerificationRepo(pool)

	u, err := users.CreateWithPassword(ctx, "lapse-"+randSuffix()+"@example.com", "", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := verifs.RequestCode(ctx, u.ID, repository.PurposeVerifyEmail,
		&repository.PendingClaim{PasswordHash: hashOf(t, "Squatter1"), Name: "Squatter"}); err != nil {
		t.Fatal(err)
	}
	expireVerification(t, pool, u.ID)

	ownerHash := hashOf(t, "RealOwner1")
	code, err := verifs.RequestCode(ctx, u.ID, repository.PurposeVerifyEmail,
		&repository.PendingClaim{PasswordHash: ownerHash, Name: "Real Owner"})
	if err != nil {
		t.Fatal(err)
	}
	claim, ok, err := verifs.PendingClaim(ctx, u.ID, repository.PurposeVerifyEmail)
	if err != nil {
		t.Fatal(err)
	}
	if !ok || claim.PasswordHash != ownerHash || claim.Name != "Real Owner" {
		t.Fatal("an expired claim still holds the address — the hold is a permanent lock, not a rate limit")
	}
	if err := verifs.Consume(ctx, u.ID, repository.PurposeVerifyEmail, code,
		func(ctx context.Context, tx pgx.Tx, c repository.PendingClaim) error {
			return users.FinalizeVerificationTx(ctx, tx, u.ID, c.PasswordHash, c.Name)
		}); err != nil {
		t.Fatalf("owner could not claim the lapsed address: %v", err)
	}
}
