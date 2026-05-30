package middleware

import (
	"net/http"

	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/domain/feature"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

// RequireFeature gates a route (group) behind a subscription feature. It
// resolves the caller's store + plan and returns 402 FEATURE_LOCKED when the
// plan does not unlock the feature. Centralizes the per-handler proBlocked
// pattern so feature→tier rules live in one place (internal/domain/feature).
func RequireFeature(f feature.Feature, stores *repository.StoreRepo, subs *repository.SubscriptionRepo) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			uid, ok := auth.UserIDFromContext(r.Context())
			if !ok {
				response.Error(w, http.StatusUnauthorized, "unauthorized")
				return
			}
			store, err := stores.FindByOwnerID(r.Context(), uid)
			if err != nil {
				response.Error(w, http.StatusBadRequest, "toko belum dibuat")
				return
			}
			sub, err := subs.GetOrCreate(r.Context(), store.ID)
			if err != nil {
				response.Error(w, http.StatusInternalServerError, "internal error")
				return
			}
			if !feature.HasFeature(sub.Plan, f) {
				response.JSON(w, http.StatusPaymentRequired, map[string]any{
					"code":       "FEATURE_LOCKED",
					"message":    "Fitur ini tersedia di paket Bisnis",
					"feature":    string(f),
					"upgrade_to": "bisnis",
				})
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
