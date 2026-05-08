package middleware

import (
	"net/http"

	"github.com/google/uuid"

	"github.com/tokoflow/tokoflow/apps/api/internal/auth"
	"github.com/tokoflow/tokoflow/apps/api/internal/pkg/response"
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
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
