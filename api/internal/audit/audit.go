// Package audit provides a thin convenience wrapper around the
// audit_log repository. Handlers call Log(ctx, ...) with a store ID +
// human-readable summary and the package handles actor enrichment
// (looking up the current user's email/name from the request context)
// and structured-error logging when the insert itself fails.
package audit

import (
	"context"
	"log/slog"

	"github.com/google/uuid"

	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/repository"
)

type Logger struct {
	repo   *repository.AuditRepo
	users  *repository.UserRepo
	logger *slog.Logger
}

func New(repo *repository.AuditRepo, users *repository.UserRepo, logger *slog.Logger) *Logger {
	return &Logger{repo: repo, users: users, logger: logger}
}

type Event struct {
	Action     string
	EntityType string
	EntityID   string
	Summary    string
	Metadata   map[string]any
}

// Log records an audit entry. Errors from the insert are logged via slog
// but never propagated — callers should never have a real mutation
// rolled back because the audit log was unhappy. Actor identity is read
// from the request context; pass a context with no user (e.g. webhooks)
// to record system actions.
func (l *Logger) Log(ctx context.Context, storeID uuid.UUID, ev Event) {
	if l == nil {
		return
	}
	in := repository.AuditInput{
		StoreID:    storeID,
		Action:     ev.Action,
		EntityType: ev.EntityType,
		EntityID:   ev.EntityID,
		Summary:    ev.Summary,
		Metadata:   ev.Metadata,
	}

	if uid, ok := auth.UserIDFromContext(ctx); ok {
		in.ActorUserID = &uid
		// Best-effort enrichment. If the user lookup fails we still log
		// the action — actor_user_id is the canonical reference, the
		// email/name fields are convenience.
		if user, err := l.users.FindByID(ctx, uid); err == nil && user != nil {
			in.ActorEmail = user.Email
			in.ActorName = user.Name
		}
	}

	// When an admin is impersonating, the actor_user_id is the seller
	// they're acting as, but we also stamp the original admin's ID so
	// the seller can see "Admin X (impersonating you) did Y" in their
	// own activity feed.
	if impID, ok := auth.ImpersonatorIDFromContext(ctx); ok {
		in.ImpersonatorUserID = &impID
	}

	if err := l.repo.Log(ctx, in); err != nil {
		l.logger.Error("audit log insert failed",
			"err", err,
			"store_id", storeID,
			"action", ev.Action)
	}
}
