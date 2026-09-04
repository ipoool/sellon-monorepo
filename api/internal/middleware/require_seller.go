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
			// RequireAuth already loaded (and ban-checked) the row.
			user, ok := auth.SessionUserFromContext(r.Context())
			if !ok {
				uid, hasUID := auth.UserIDFromContext(r.Context())
				if !hasUID {
					response.Error(w, http.StatusUnauthorized, "unauthorized")
					return
				}
				var err error
				user, err = users.FindByID(r.Context(), uid)
				if err != nil {
					response.Error(w, http.StatusUnauthorized, "unauthorized")
					return
				}
			}
			if user.IsBanned() {
				response.Error(w, http.StatusForbidden,
					"akun ini diblokir oleh admin. Hubungi support untuk informasi lebih lanjut.")
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
