package scheduler

// The weekly job builds its own opt-out link because importing the handler
// package here would be an import cycle. That duplication is only safe while
// the two derivations agree, so this test pins them together: if either side
// changes its input string, hash or truncation, every unsubscribe link in
// the wild silently stops validating and recipients can no longer opt out.

import (
	"testing"

	"github.com/google/uuid"

	"github.com/sellon/sellon/api/internal/handler"
)

func TestUnsubscribeLinkMatchesHandler(t *testing.T) {
	const secret = "test-secret-value"
	const base = "https://api.example.com"
	id := uuid.MustParse("11111111-2222-3333-4444-555555555555")

	got := handlerUnsubscribeURL(base, secret, id)
	want := handler.UnsubscribeURL(base, secret, id)
	if got != want {
		t.Fatalf("scheduler and handler disagree on the opt-out link\n scheduler: %s\n handler:   %s", got, want)
	}

	// A different secret must produce a different token, or the link would
	// be forgeable by anyone who can read a single example.
	if handlerUnsubscribeURL(base, "another-secret", id) == got {
		t.Error("token does not depend on the secret")
	}
	// And it must be per-user.
	other := uuid.MustParse("99999999-2222-3333-4444-555555555555")
	if handlerUnsubscribeURL(base, secret, other) == got {
		t.Error("token does not depend on the user id")
	}
}

// A trailing slash on the base URL must not produce a double slash.
func TestUnsubscribeLinkNormalisesBase(t *testing.T) {
	const secret = "s"
	id := uuid.New()
	if handlerUnsubscribeURL("https://api.example.com/", secret, id) !=
		handlerUnsubscribeURL("https://api.example.com", secret, id) {
		t.Error("trailing slash changes the link")
	}
}
