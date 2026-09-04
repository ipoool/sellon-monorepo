package middleware

import (
	"net/http"

	"github.com/google/uuid"

	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

// RequireAuth reads the session cookie, verifies the JWT, and stores the
// user ID in the request context. Rejects with 401 if invalid or missing.
//
// It also loads the user row and enforces the two things a stateless JWT
// cannot: a ban takes effect immediately instead of at token expiry (up to
// JWT_TTL_HOURS later), and a password reset revokes every token issued
// before it via users.sessions_valid_after. The row is cached on the context
// so RequireSeller/RequireAdmin don't re-query it.
func RequireAuth(jwt *auth.JWTService, users *repository.UserRepo) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			cookie, err := r.Cookie(auth.SessionCookieName)
			if err != nil || cookie.Value == "" {
				response.Error(w, http.StatusUnauthorized, "unauthorized")
				return
			}
			claims, err := jwt.Verify(cookie.Value)
			if err != nil {
				response.Error(w, http.StatusUnauthorized, "unauthorized")
				return
			}
			if claims.UserID == uuid.Nil {
				response.Error(w, http.StatusUnauthorized, "unauthorized")
				return
			}
			user, err := users.FindByID(r.Context(), claims.UserID)
			if err != nil {
				response.Error(w, http.StatusUnauthorized, "unauthorized")
				return
			}
			if claims.IssuedAt != nil && !user.SessionIssuedAtValid(claims.IssuedAt.Time) {
				response.Error(w, http.StatusUnauthorized, "sesi sudah tidak berlaku, silakan masuk lagi")
				return
			}
			if user.IsBanned() {
				response.Error(w, http.StatusForbidden,
					"akun ini diblokir oleh admin. Hubungi support untuk informasi lebih lanjut.")
				return
			}
			ctx := auth.WithUserID(r.Context(), claims.UserID)
			ctx = auth.WithSessionUser(ctx, user)
			if claims.Impersonator != nil && *claims.Impersonator != uuid.Nil {
				ctx = auth.WithImpersonatorID(ctx, *claims.Impersonator)
			}
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
