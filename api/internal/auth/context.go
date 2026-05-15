package auth

import (
	"context"

	"github.com/google/uuid"
)

type ctxKey string

const (
	userIDKey         ctxKey = "uid"
	impersonatorIDKey ctxKey = "imp"
)

func WithUserID(ctx context.Context, id uuid.UUID) context.Context {
	return context.WithValue(ctx, userIDKey, id)
}

func UserIDFromContext(ctx context.Context) (uuid.UUID, bool) {
	v := ctx.Value(userIDKey)
	if v == nil {
		return uuid.Nil, false
	}
	id, ok := v.(uuid.UUID)
	if !ok {
		return uuid.Nil, false
	}
	return id, true
}

// WithImpersonatorID stamps the originating admin's user ID onto the
// context when the current session is an admin acting as someone else.
func WithImpersonatorID(ctx context.Context, id uuid.UUID) context.Context {
	return context.WithValue(ctx, impersonatorIDKey, id)
}

// ImpersonatorIDFromContext returns the admin user_id that initiated
// the impersonation, or (uuid.Nil, false) when the session is normal.
func ImpersonatorIDFromContext(ctx context.Context) (uuid.UUID, bool) {
	v := ctx.Value(impersonatorIDKey)
	if v == nil {
		return uuid.Nil, false
	}
	id, ok := v.(uuid.UUID)
	if !ok {
		return uuid.Nil, false
	}
	return id, true
}
