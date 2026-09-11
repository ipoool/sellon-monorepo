package repository_test

// Integration tests for Google sign-in account resolution (real Postgres,
// see authflow_integration_test.go for how to run).
//
// These exist because migration 0096 added a unique index on lower(email)
// while FindOrCreateByGoogleID still INSERTed unconditionally on a
// google_id conflict. Any Google login whose address already had a row —
// which is every seller who tried the email+password signup first — hit
// that index and got a 500 instead of being signed in.

import (
	"context"
	"testing"

	"github.com/sellon/sellon/api/internal/repository"
)

// The exact production situation: someone starts an email+password signup,
// never receives the code (outbound mail was down), then signs in with
// Google using the same address. That must land them in the SAME account,
// not error and not create a duplicate.
func TestGoogleSignInLinksExistingEmailAccount(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	users := repository.NewUserRepo(pool)

	email := "linkme-" + randSuffix() + "@example.com"

	// Abandoned signup: row exists, no password (it is only applied after
	// the emailed code is verified), not verified.
	pending, err := users.CreateWithPassword(ctx, email, "Pending Signup", "")
	if err != nil {
		t.Fatalf("seed pending signup: %v", err)
	}
	if pending.IsEmailVerified() {
		t.Fatal("fixture should start unverified")
	}

	googleID := "google-" + randSuffix()
	got, isNew, err := users.FindOrCreateByGoogleID(ctx, googleID, email, "Google Name", "https://pic/1.png")
	if err != nil {
		t.Fatalf("google sign-in on an existing address must not error: %v", err)
	}
	if isNew {
		t.Error("should have linked the existing row, not created a second account")
	}
	if got.ID != pending.ID {
		t.Fatalf("landed in a different account: got %s, want %s", got.ID, pending.ID)
	}
	if got.GoogleID != googleID {
		t.Errorf("google id not linked: %q", got.GoogleID)
	}
	// Google proved the address, so the account is now verified and usable.
	if !got.IsEmailVerified() {
		t.Error("linking should mark the email verified — Google already proved it")
	}

	var count int
	if err := pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM users WHERE LOWER(email) = LOWER($1)`, email).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("expected exactly one row for the address, got %d", count)
	}

	// Signing in again is a plain profile refresh, not another link.
	again, isNew2, err := users.FindOrCreateByGoogleID(ctx, googleID, email, "Renamed", "https://pic/2.png")
	if err != nil {
		t.Fatalf("repeat sign-in: %v", err)
	}
	if isNew2 || again.ID != pending.ID {
		t.Error("repeat sign-in should return the same account")
	}
	if again.Name != "Renamed" {
		t.Errorf("profile not refreshed: %q", again.Name)
	}
}

// A brand-new address creates a verified account in one step.
func TestGoogleSignInCreatesVerifiedAccount(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	users := repository.NewUserRepo(pool)

	email := "fresh-" + randSuffix() + "@example.com"
	got, isNew, err := users.FindOrCreateByGoogleID(ctx, "google-"+randSuffix(), email, "Fresh", "")
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if !isNew {
		t.Error("a brand-new address should report isNew")
	}
	if !got.IsEmailVerified() {
		t.Error("Google already proved the address; the account should start verified")
	}
	if got.HasPassword() {
		t.Error("a Google account should not be given a password")
	}
}

// Two Google identities must never merge onto one address. This can only
// happen if a Google account's address changes to one another identity
// already holds; silently reassigning it would hand over the account.
func TestGoogleSignInRefusesSecondIdentityOnSameEmail(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	users := repository.NewUserRepo(pool)

	email := "taken-" + randSuffix() + "@example.com"
	if _, _, err := users.FindOrCreateByGoogleID(ctx, "google-a-"+randSuffix(), email, "First", ""); err != nil {
		t.Fatalf("seed first identity: %v", err)
	}
	if _, _, err := users.FindOrCreateByGoogleID(ctx, "google-b-"+randSuffix(), email, "Second", ""); err == nil {
		t.Fatal("a second Google identity claiming the same address must be refused")
	}
}

// A password planted on a row that never verified its email must NOT become
// usable when Google sign-in later marks that address verified. Before this,
// registering someone else's address (pre-0097 behaviour wrote the hash
// immediately) and waiting for them to sign in with Google handed the
// attacker a working login on the victim's account.
func TestGoogleLinkClearsUnverifiedPassword(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	users := repository.NewUserRepo(pool)

	email := "planted-" + randSuffix() + "@example.com"
	// Simulate the pre-0097 row: password present, never verified.
	victim, err := users.CreateWithPassword(ctx, email, "Victim", hashOf(t, "Attacker1"))
	if err != nil {
		t.Fatal(err)
	}
	if !victim.HasPassword() || victim.IsEmailVerified() {
		t.Fatal("fixture should have a password and be unverified")
	}

	linked, _, err := users.FindOrCreateByGoogleID(ctx, "google-"+randSuffix(), email, "Victim", "")
	if err != nil {
		t.Fatalf("google sign-in: %v", err)
	}
	if !linked.IsEmailVerified() {
		t.Fatal("linking should verify the address")
	}
	if linked.HasPassword() {
		t.Fatal("a password that predates its own verification must be cleared on link, " +
			"or it becomes a working login for whoever planted it")
	}
}

// A password on an ALREADY-verified row is a real credential and must
// survive linking — otherwise a seller who legitimately set a password
// would silently lose it by signing in with Google once.
func TestGoogleLinkKeepsVerifiedPassword(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	users := repository.NewUserRepo(pool)

	email := "real-" + randSuffix() + "@example.com"
	u, err := users.CreateWithPassword(ctx, email, "Real", hashOf(t, "Legit1234"))
	if err != nil {
		t.Fatal(err)
	}
	if err := users.MarkEmailVerified(ctx, u.ID); err != nil {
		t.Fatal(err)
	}

	linked, _, err := users.FindOrCreateByGoogleID(ctx, "google-"+randSuffix(), email, "Real", "")
	if err != nil {
		t.Fatal(err)
	}
	if !linked.HasPassword() {
		t.Error("a verified account's password must survive Google linking")
	}
}
