package auth

import (
	"context"

	"github.com/google/uuid"

	"github.com/sellon/sellon/api/internal/repository"
)

type ctxKey string

const (
	userIDKey         ctxKey = "uid"
	impersonatorIDKey ctxKey = "imp"
	buyerKey          ctxKey = "buyer"
	sessionUserKey    ctxKey = "session_user"
)

// WithBuyer / BuyerFromContext carry the verified storefront-buyer claims
// (course-link scoped). Separate from the seller userIDKey so the two auth
// realms never cross.
func WithBuyer(ctx context.Context, c *BuyerClaims) context.Context {
	return context.WithValue(ctx, buyerKey, c)
}

func BuyerFromContext(ctx context.Context) (*BuyerClaims, bool) {
	v := ctx.Value(buyerKey)
	if v == nil {
		return nil, false
	}
	c, ok := v.(*BuyerClaims)
	return c, ok && c != nil
}

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

// WithSessionUser caches the authenticated user row that RequireAuth already
// loaded (for the ban + session-revocation checks) so downstream middleware
// and handlers don't each re-query it.
func WithSessionUser(ctx context.Context, u *repository.User) context.Context {
	return context.WithValue(ctx, sessionUserKey, u)
}

// SessionUserFromContext returns the user row loaded by RequireAuth.
func SessionUserFromContext(ctx context.Context) (*repository.User, bool) {
	v := ctx.Value(sessionUserKey)
	if v == nil {
		return nil, false
	}
	u, ok := v.(*repository.User)
	return u, ok && u != nil
}
