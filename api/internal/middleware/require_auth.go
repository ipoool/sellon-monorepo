package middleware

import (
	"net/http"

	"github.com/google/uuid"

	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/pkg/response"
)

// RequireAuth reads the session cookie, verifies the JWT, and stores the
// user ID in the request context. Rejects with 401 if invalid or missing.
func RequireAuth(jwt *auth.JWTService) func(http.Handler) http.Handler {
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
			ctx := auth.WithUserID(r.Context(), claims.UserID)
			if claims.Impersonator != nil && *claims.Impersonator != uuid.Nil {
				ctx = auth.WithImpersonatorID(ctx, *claims.Impersonator)
			}
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
