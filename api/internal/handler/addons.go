package handler

import (
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/sellon/sellon/api/internal/audit"
	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/domain/feature"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

// AddonHandler is the seller side of add-ons: see what is for sale, turn
// one on, turn one off.
//
// Buying is deliberately NOT a payment here. An add-on activates
// immediately and is first charged on the next renewal, so there is nothing
// to charge at this moment — which is the whole point of the free tail.
type AddonHandler struct {
	addons *repository.AddonRepo
	subs   *repository.SubscriptionRepo
	stores *repository.StoreRepo
	audit  *audit.Logger
	logger *slog.Logger
}

func NewAddonHandler(
	addons *repository.AddonRepo,
	subs *repository.SubscriptionRepo,
	stores *repository.StoreRepo,
	auditLog *audit.Logger,
	logger *slog.Logger,
) *AddonHandler {
	return &AddonHandler{addons: addons, subs: subs, stores: stores, audit: auditLog, logger: logger}
}

type addonDTO struct {
	Code        string `json:"code"`
	Name        string `json:"name"`
	Description string `json:"description"`

	MonthlyPriceCents int64 `json:"monthly_price_cents"`
	YearlyPriceCents  int64 `json:"yearly_price_cents"`

	// Which gated features this package contains, so the card can list
	// them without the frontend keeping its own copy of the mapping.
	Features []string `json:"features"`

	// Owned state, for the store asking.
	Active bool `json:"active"`
	// True while it is working but not yet billed.
	InFreeTail bool    `json:"in_free_tail"`
	FreeUntil  *string `json:"free_until"`
}

// GET /api/v1/subscription/addons
func (h *AddonHandler) List(w http.ResponseWriter, r *http.Request) {
	catalogue, err := h.addons.ListAddons(r.Context(), false)
	if err != nil {
		h.logger.Error("list addons", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	held := map[string]repository.StoreAddon{}
	plan := "free"
	store, serr := h.storeFor(r)
	if serr == nil {
		if sub, err := h.subs.GetOrCreate(r.Context(), store.ID); err == nil {
			plan = sub.Plan
		}
		rows, err := h.addons.ListForStore(r.Context(), store.ID)
		if err != nil {
			h.logger.Error("list store addons", "err", err)
			response.Error(w, http.StatusInternalServerError, "internal error")
			return
		}
		for _, row := range rows {
			held[row.AddonCode] = row
		}
	}

	out := make([]addonDTO, 0, len(catalogue))
	for _, a := range catalogue {
		d := addonDTO{
			Code: a.Code, Name: a.Name, Description: a.Description,
			MonthlyPriceCents: a.MonthlyPriceCents,
			YearlyPriceCents:  a.YearlyPriceCents,
			Features:          featureCodes(feature.Addon(a.Code)),
		}
		if row, ok := held[a.Code]; ok {
			d.Active = true
			d.InFreeTail = row.InFreeTail()
			if row.FreeUntil != nil {
				v := row.FreeUntil.Format(time.RFC3339)
				d.FreeUntil = &v
			}
		}
		out = append(out, d)
	}

	response.JSON(w, http.StatusOK, map[string]any{
		"addons": out,
		// Add-ons sit on top of Pro, so the UI knows whether to offer them
		// or to send the seller to upgrade first.
		"plan":       plan,
		"can_buy":    plan == "pro",
		"bundled_in": "bisnis",
	})
}

// POST /api/v1/subscription/addons/{code}
//
// Activates immediately. The first time a store takes a given add-on it
// runs free until the current period ends and joins the next invoice;
// after that it is billed from the next renewal with no free tail, so
// cycling it cannot make it permanently free.
func (h *AddonHandler) Activate(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	code := chi.URLParam(r, "code")

	sub, err := h.subs.GetOrCreate(r.Context(), store.ID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	// Add-ons are sold on top of Pro. Refused here AND in Entitlements.Has,
	// because a row written for a free store would otherwise sit there
	// waiting to grant access the moment anything stopped checking.
	if sub.Plan != "pro" && sub.Plan != "bisnis" {
		response.JSON(w, http.StatusPaymentRequired, map[string]any{
			"code":       "ADDON_NEEDS_PRO",
			"message":    "Paket tambahan tersedia setelah kamu berlangganan Pro",
			"upgrade_to": "pro",
		})
		return
	}
	if sub.Plan == "bisnis" {
		response.JSON(w, http.StatusConflict, map[string]any{
			"code":    "ALREADY_BUNDLED",
			"message": "Paket Bisnis sudah termasuk semua paket tambahan",
		})
		return
	}

	row, err := h.addons.Activate(r.Context(), store.ID, code, sub.CurrentPeriodEnd)
	switch {
	case errors.Is(err, repository.ErrAddonAlreadyHeld):
		response.Error(w, http.StatusConflict, "paket ini sudah aktif")
		return
	case errors.Is(err, repository.ErrAddonNotFound):
		response.Error(w, http.StatusNotFound, "paket tidak ditemukan")
		return
	case err != nil:
		h.logger.Error("activate addon", "err", err, "code", code)
		response.Error(w, http.StatusInternalServerError, "gagal mengaktifkan paket")
		return
	}

	h.audit.Log(r.Context(), store.ID, audit.Event{
		Action:     "addon.activated",
		EntityType: "addon",
		EntityID:   code,
		Summary:    "Aktifkan paket " + code,
		Metadata: map[string]any{
			"code":       code,
			"free_until": row.FreeUntil,
		},
	})

	response.JSON(w, http.StatusCreated, map[string]any{
		"code":         code,
		"active":       true,
		"in_free_tail": row.InFreeTail(),
		"free_until":   row.FreeUntil,
	})
}

// DELETE /api/v1/subscription/addons/{code}
//
// Takes effect immediately. A seller who turns something off expects it
// off; "you keep it until the 31st" is a surprise in the direction nobody
// asks for, and anything already invoiced has already been paid.
func (h *AddonHandler) Cancel(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	code := chi.URLParam(r, "code")

	if err := h.addons.Cancel(r.Context(), store.ID, code); err != nil {
		if errors.Is(err, repository.ErrAddonNotFound) {
			response.Error(w, http.StatusNotFound, "paket ini tidak aktif")
			return
		}
		h.logger.Error("cancel addon", "err", err, "code", code)
		response.Error(w, http.StatusInternalServerError, "gagal menonaktifkan paket")
		return
	}

	h.audit.Log(r.Context(), store.ID, audit.Event{
		Action:     "addon.cancelled",
		EntityType: "addon",
		EntityID:   code,
		Summary:    "Nonaktifkan paket " + code,
		Metadata:   map[string]any{"code": code},
	})
	response.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *AddonHandler) storeFor(r *http.Request) (*repository.Store, error) {
	uid, _ := auth.UserIDFromContext(r.Context())
	return h.stores.FindByOwnerID(r.Context(), uid)
}

// featureCodes lists an add-on's contents for display, from the one place
// that owns the mapping.
func featureCodes(a feature.Addon) []string {
	fs := feature.AddonFeatures(a)
	out := make([]string, 0, len(fs))
	for _, f := range fs {
		out = append(out, string(f))
	}
	return out
}
