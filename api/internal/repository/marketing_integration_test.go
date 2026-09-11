package repository_test

// Integration tests for marketing consent (real Postgres, see
// authflow_integration_test.go for how to run).
//
// These guard the rule that got our sending domain suspended: the weekly
// promotional email went to EVERY registered user, because ListForMarketing
// selected all of them and there was no consent column at all. Creating an
// account is not consent to marketing.

import (
	"context"
	"testing"

	"github.com/sellon/sellon/api/internal/repository"
)

func TestMarketingRequiresExplicitOptIn(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	users := repository.NewUserRepo(pool)

	// A normal signup. The defining assertion of this whole change: a fresh
	// account must NOT be a marketing recipient.
	u, err := users.CreateWithPassword(ctx, "optin-"+randSuffix()+"@example.com", "Opt In", "")
	if err != nil {
		t.Fatal(err)
	}
	if u.MarketingOptInAt != nil {
		t.Fatal("a new account must start with no marketing consent")
	}
	if inMarketingList(t, users, u.Email) {
		t.Fatal("a user who never opted in was selected for marketing")
	}

	// Opting in puts them on the list.
	if err := users.SetMarketingOptIn(ctx, u.ID, true); err != nil {
		t.Fatal(err)
	}
	if !inMarketingList(t, users, u.Email) {
		t.Error("an opted-in user should be selected")
	}

	// Opting in again must not move the original timestamp — the record of
	// WHEN consent was given is what proves it on a compliance review.
	before, err := users.FindByID(ctx, u.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err := users.SetMarketingOptIn(ctx, u.ID, true); err != nil {
		t.Fatal(err)
	}
	after, err := users.FindByID(ctx, u.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !before.MarketingOptInAt.Equal(*after.MarketingOptInAt) {
		t.Error("re-opting in should not rewrite the original consent timestamp")
	}

	// Unsubscribing removes them, and is idempotent.
	if err := users.SetMarketingOptIn(ctx, u.ID, false); err != nil {
		t.Fatal(err)
	}
	if inMarketingList(t, users, u.Email) {
		t.Error("an unsubscribed user must not be selected")
	}
	if err := users.SetMarketingOptIn(ctx, u.ID, false); err != nil {
		t.Errorf("unsubscribing twice should be a no-op, got %v", err)
	}
}

// A banned account must never receive marketing either.
func TestMarketingExcludesBannedUsers(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	users := repository.NewUserRepo(pool)

	u, err := users.CreateWithPassword(ctx, "banned-"+randSuffix()+"@example.com", "Banned", "")
	if err != nil {
		t.Fatal(err)
	}
	if err := users.SetMarketingOptIn(ctx, u.ID, true); err != nil {
		t.Fatal(err)
	}
	if _, err := users.SetBanned(ctx, u.ID, true); err != nil {
		t.Fatal(err)
	}
	if inMarketingList(t, users, u.Email) {
		t.Error("a banned user was selected for marketing")
	}
}

func inMarketingList(t *testing.T, users *repository.UserRepo, email string) bool {
	t.Helper()
	list, err := users.ListForMarketing(context.Background())
	if err != nil {
		t.Fatalf("ListForMarketing: %v", err)
	}
	for _, u := range list {
		if u.Email == email {
			return true
		}
	}
	return false
}
