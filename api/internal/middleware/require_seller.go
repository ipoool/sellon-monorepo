package middleware

import (
	"net/http"

	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

// RequireSeller blocks platform admin accounts from accessing seller-facing
// routes. Admins manage the platform via /admin/* and must not create stores,
// products, orders, promos, etc. under their own account.
//
// During impersonation the JWT uid belongs to the impersonated seller (not the
// admin), so FindByID returns a non-admin user and access is correctly granted.
func RequireSeller(users *repository.UserRepo) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			uid, ok := auth.UserIDFromContext(r.Context())
			if !ok {
				response.Error(w, http.StatusUnauthorized, "unauthorized")
				return
			}
			user, err := users.FindByID(r.Context(), uid)
			if err != nil {
				response.Error(w, http.StatusUnauthorized, "unauthorized")
				return
			}
			if user.IsAdmin() {
				response.Error(w, http.StatusForbidden, "akun admin tidak dapat mengakses fitur seller")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
