package middleware

import (
	"net/http"

	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/pkg/response"
)

// RequireBuyer reads the buyer_session cookie, verifies the buyer JWT, and
// stamps the buyer claims on the request context. Rejects with 401 otherwise.
// Kept entirely separate from RequireAuth (seller) — different cookie, different
// claims, different issuer — so the two auth realms can't cross.
func RequireBuyer(jwt *auth.JWTService) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			cookie, err := r.Cookie(auth.BuyerCookieName)
			if err != nil || cookie.Value == "" {
				response.Error(w, http.StatusUnauthorized, "unauthorized")
				return
			}
			claims, err := jwt.VerifyBuyer(cookie.Value)
			if err != nil {
				response.Error(w, http.StatusUnauthorized, "unauthorized")
				return
			}
			next.ServeHTTP(w, r.WithContext(auth.WithBuyer(r.Context(), claims)))
		})
	}
}
