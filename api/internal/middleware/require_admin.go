package middleware

import (
	"net/http"

	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

// RequireAdmin gates platform-level admin routes. Must be chained after
// RequireAuth so the user_id is already on the context. Returns 403
// (not 401) so a banned/non-admin session can distinguish "you are not
// allowed" from "you are not signed in".
//
// During impersonation we deny: an admin acting as a regular user is
// pretending to be that user, and shouldn't be able to reach the admin
// console. They must exit impersonation first.
func RequireAdmin(users *repository.UserRepo) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			uid, ok := auth.UserIDFromContext(r.Context())
			if !ok {
				response.Error(w, http.StatusUnauthorized, "unauthorized")
				return
			}
			if _, impersonating := auth.ImpersonatorIDFromContext(r.Context()); impersonating {
				response.Error(w, http.StatusForbidden,
					"keluar dari mode impersonation untuk akses admin")
				return
			}
			user, err := users.FindByID(r.Context(), uid)
			if err != nil || user.IsBanned() || !user.IsAdmin() {
				response.Error(w, http.StatusForbidden, "akses admin diperlukan")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
