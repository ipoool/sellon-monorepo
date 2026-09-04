package repository_test

// Integration test for the register/verify/reset auth flow against a real
// Postgres (per CLAUDE.md: prefer integration tests over mocking the DB).
// Skipped unless TEST_DATABASE_URL is set.
//
//   docker run -d --name pg -e POSTGRES_USER=sellon -e POSTGRES_PASSWORD=sellon \
//     -e POSTGRES_DB=sellon_test -p 55432:5432 postgres:16-alpine
//   TEST_DATABASE_URL='postgres://sellon:sellon@localhost:55432/sellon_test' go test ./internal/repository/ -run Auth -v

import (
	"context"
	"log/slog"
	"os"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	"github.com/sellon/sellon/api/internal/db"
	"github.com/sellon/sellon/api/internal/repository"
)

func testPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	if err := db.Migrate(dsn, slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return pool
}

func hashOf(t *testing.T, pw string) string {
	t.Helper()
	h, err := bcrypt.GenerateFromPassword([]byte(pw), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	return string(h)
}

// The takeover this whole change exists to prevent: a legacy Google-only row
// (email already verified, no password) must NOT be claimable by an anonymous
// caller without the emailed code, and the parked password must only land on
// the account once the code is consumed.
func TestAuthClaimRequiresCode(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	users := repository.NewUserRepo(pool)
	verifs := repository.NewEmailVerificationRepo(pool)

	email := "legacy-" + randSuffix() + "@example.com"
	u, err := users.CreateWithPassword(ctx, email, "Legacy User", "")
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	// Simulate migration 0096's backfill: Google logins are pre-verified.
	if err := users.MarkEmailVerified(ctx, u.ID); err != nil {
		t.Fatalf("mark verified: %v", err)
	}

	attackerHash := hashOf(t, "Attacker1")
	code, err := verifs.RequestCode(ctx, u.ID, repository.PurposeVerifyEmail,
		&repository.PendingClaim{PasswordHash: attackerHash, Name: "Attacker"})
	if err != nil {
		t.Fatalf("request code: %v", err)
	}

	// Before the code is consumed the account must still have NO password,
	// so nobody can log in as it.
	got, err := users.FindByID(ctx, u.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.HasPassword() {
		t.Fatal("password was installed before the code was verified — takeover is possible")
	}

	// A wrong code must not install it either.
	err = verifs.Consume(ctx, u.ID, repository.PurposeVerifyEmail, "000000",
		func(ctx context.Context, tx pgx.Tx, c repository.PendingClaim) error {
			return users.FinalizeVerificationTx(ctx, tx, u.ID, c.PasswordHash, c.Name)
		})
	if err == nil {
		t.Fatal("wrong code accepted")
	}
	got, _ = users.FindByID(ctx, u.ID)
	if got.HasPassword() {
		t.Fatal("wrong code still installed the password")
	}

	// The real code installs it.
	if err := verifs.Consume(ctx, u.ID, repository.PurposeVerifyEmail, code,
		func(ctx context.Context, tx pgx.Tx, c repository.PendingClaim) error {
			return users.FinalizeVerificationTx(ctx, tx, u.ID, c.PasswordHash, c.Name)
		}); err != nil {
		t.Fatalf("consume valid code: %v", err)
	}
	got, _ = users.FindByID(ctx, u.ID)
	if !got.HasPassword() {
		t.Fatal("valid code did not install the password")
	}
	if got.Name != "Attacker" {
		t.Fatalf("pending name not applied, got %q", got.Name)
	}

	// Single use.
	if err := verifs.Consume(ctx, u.ID, repository.PurposeVerifyEmail, code, nil); err == nil {
		t.Fatal("code was reusable")
	}
}

// The attempt counter must be bumped by the same statement that reads the
// row, so parallel guesses can't all slip past the 5-attempt lock.
func TestAuthOTPAttemptLockIsAtomic(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	users := repository.NewUserRepo(pool)
	verifs := repository.NewEmailVerificationRepo(pool)

	u, err := users.CreateWithPassword(ctx, "brute-"+randSuffix()+"@example.com", "Brute", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := verifs.RequestCode(ctx, u.ID, repository.PurposeVerifyEmail,
		&repository.PendingClaim{PasswordHash: hashOf(t, "Correct1")}); err != nil {
		t.Fatal(err)
	}

	const parallel = 40
	var wg sync.WaitGroup
	var mu sync.Mutex
	locked := 0
	invalid := 0
	for i := 0; i < parallel; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			err := verifs.Consume(ctx, u.ID, repository.PurposeVerifyEmail, "999999", nil)
			mu.Lock()
			defer mu.Unlock()
			switch {
			case err == repository.ErrVerificationLocked:
				locked++
			case err == repository.ErrVerificationInvalid:
				invalid++
			}
		}()
	}
	wg.Wait()

	// At most 5 guesses may actually be evaluated; the rest must be locked out.
	if invalid > 5 {
		t.Fatalf("attempt lock leaked: %d guesses evaluated (max 5), %d locked", invalid, locked)
	}
	if locked == 0 {
		t.Fatal("no request was locked out — the counter is not enforcing")
	}
	t.Logf("evaluated=%d locked=%d of %d parallel guesses", invalid, locked, parallel)
}

// A reset must set the password and revoke tokens issued before it.
func TestAuthPasswordResetRevokesSessions(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	users := repository.NewUserRepo(pool)
	verifs := repository.NewEmailVerificationRepo(pool)

	u, err := users.CreateWithPassword(ctx, "reset-"+randSuffix()+"@example.com", "Reset", hashOf(t, "Original1"))
	if err != nil {
		t.Fatal(err)
	}
	before := timeNow()
	if !u.SessionIssuedAtValid(before) {
		t.Fatal("fresh account should accept an existing token")
	}

	code, err := verifs.RequestCode(ctx, u.ID, repository.PurposeResetPassword, nil)
	if err != nil {
		t.Fatal(err)
	}
	// A reset code must not be usable on the verify-email endpoint.
	if err := verifs.Consume(ctx, u.ID, repository.PurposeVerifyEmail, code, nil); err == nil {
		t.Fatal("reset code was accepted as a verification code")
	}

	newHash := hashOf(t, "Brandnew1")
	if err := verifs.Consume(ctx, u.ID, repository.PurposeResetPassword, code,
		func(ctx context.Context, tx pgx.Tx, _ repository.PendingClaim) error {
			return users.ResetPasswordTx(ctx, tx, u.ID, newHash)
		}); err != nil {
		t.Fatalf("consume reset code: %v", err)
	}

	got, err := users.FindByID(ctx, u.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.PasswordHash != newHash {
		t.Fatal("password not updated")
	}
	if got.SessionsValidAfter == nil {
		t.Fatal("sessions_valid_after not stamped — old JWTs stay valid after a reset")
	}
	if got.SessionIssuedAtValid(before) {
		t.Fatal("a token issued before the reset is still accepted")
	}
}
