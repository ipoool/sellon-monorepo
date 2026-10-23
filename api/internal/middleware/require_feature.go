package middleware

import (
	"net/http"

	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/domain/feature"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

// RequireFeature gates a route (group) behind a subscription feature.
//
// Resolves the caller's store, plan and add-ons, and answers 402
// FEATURE_LOCKED when the store does not hold the feature. The response
// names what to buy — an add-on code when the feature is sold as one — so
// the frontend can offer the right thing rather than a generic "upgrade".
func RequireFeature(f feature.Feature, stores *repository.StoreRepo, subs *repository.SubscriptionRepo, addons *repository.AddonRepo) func(http.Handler) http.Handler {
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
			ent, err := addons.EntitlementsFor(r.Context(), store.ID, sub.Plan)
			if err != nil {
				response.Error(w, http.StatusInternalServerError, "internal error")
				return
			}
			if !ent.Has(f) {
				body := map[string]any{
					"code":       "FEATURE_LOCKED",
					"feature":    string(f),
					"upgrade_to": feature.MinTier(f),
				}
				if a, needs := ent.Missing(f); needs {
					// Sold as an add-on. Name it, so the prompt can offer
					// the Rp 99.000 package rather than pushing everyone
					// at the full bundle.
					body["addon"] = string(a)
					body["message"] = "Fitur ini ada di " + addonLabel(a)
				} else {
					body["message"] = "Fitur ini tersedia di paket Pro"
				}
				response.JSON(w, http.StatusPaymentRequired, body)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// addonLabel is the seller-facing name used in a lock message. Kept beside
// the gate rather than fetched from the database: this runs on a refused
// request, and a 402 must not need a second query to explain itself.
func addonLabel(a feature.Addon) string {
	switch a {
	case feature.AddonKasir:
		return "Paket Kasir"
	case feature.AddonAI:
		return "Analisa AI"
	case feature.AddonMembership:
		return "Paket Membership & Loyalty"
	default:
		return "paket tambahan"
	}
}
