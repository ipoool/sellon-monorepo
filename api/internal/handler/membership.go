package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/google/uuid"

	"github.com/sellon/sellon/api/internal/audit"
	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

type MembershipHandler struct {
	membership *repository.MembershipTierRepo
	stores     *repository.StoreRepo
	subs       *repository.SubscriptionRepo
	audit      *audit.Logger
	logger     *slog.Logger
}

func NewMembershipHandler(membership *repository.MembershipTierRepo, stores *repository.StoreRepo, subs *repository.SubscriptionRepo, audit *audit.Logger, logger *slog.Logger) *MembershipHandler {
	return &MembershipHandler{membership: membership, stores: stores, subs: subs, audit: audit, logger: logger}
}

func (h *MembershipHandler) requireStore(r *http.Request) (*repository.Store, error) {
	uid, _ := auth.UserIDFromContext(r.Context())
	return h.stores.FindByOwnerID(r.Context(), uid)
}

func (h *MembershipHandler) proBlocked(w http.ResponseWriter, r *http.Request, storeID uuid.UUID) bool {
	sub, err := h.subs.GetOrCreate(r.Context(), storeID)
	if err == nil && sub.Plan == "free" {
		response.JSON(w, http.StatusPaymentRequired, map[string]any{
			"error": "plan_required", "plan": "pro",
		})
		return true
	}
	return false
}

type membershipTierDTO struct {
	ID              string  `json:"id"`
	Name            string  `json:"name"`
	MinSpentCents   int64   `json:"min_spent_cents"`
	PointMultiplier float64 `json:"point_multiplier"`
	DiscountPercent int     `json:"discount_percent"`
	IsActive        bool    `json:"is_active"`
}

func toTierDTO(t repository.MembershipTier) membershipTierDTO {
	return membershipTierDTO{
		ID: t.ID.String(), Name: t.Name, MinSpentCents: t.MinSpentCents,
		PointMultiplier: t.PointMultiplier, DiscountPercent: t.DiscountPercent,
		IsActive: t.IsActive,
	}
}

// GET /api/v1/membership/tiers
func (h *MembershipHandler) ListTiers(w http.ResponseWriter, r *http.Request) {
	store, err := h.requireStore(r)
	if errors.Is(err, repository.ErrStoreNotFound) {
		response.JSON(w, http.StatusOK, map[string]any{"tiers": []membershipTierDTO{}})
		return
	}
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	tiers, err := h.membership.ListByStore(r.Context(), store.ID)
	if err != nil {
		h.logger.Error("list tiers", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	out := make([]membershipTierDTO, 0, len(tiers))
	for _, t := range tiers {
		out = append(out, toTierDTO(t))
	}
	response.JSON(w, http.StatusOK, map[string]any{"tiers": out})
}

// PUT /api/v1/membership/tiers — batch replace.
func (h *MembershipHandler) ReplaceTiers(w http.ResponseWriter, r *http.Request) {
	store, err := h.requireStore(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	if h.proBlocked(w, r, store.ID) {
		return
	}
	var body struct {
		Tiers []struct {
			Name            string  `json:"name"`
			MinSpentCents   int64   `json:"min_spent_cents"`
			PointMultiplier float64 `json:"point_multiplier"`
			DiscountPercent int     `json:"discount_percent"`
			IsActive        bool    `json:"is_active"`
		} `json:"tiers"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	inputs := make([]repository.MembershipTierInput, 0, len(body.Tiers))
	for _, t := range body.Tiers {
		inputs = append(inputs, repository.MembershipTierInput{
			Name:            t.Name,
			MinSpentCents:   t.MinSpentCents,
			PointMultiplier: t.PointMultiplier,
			DiscountPercent: t.DiscountPercent,
			IsActive:        t.IsActive,
		})
	}
	if err := h.membership.Replace(r.Context(), store.ID, inputs); err != nil {
		h.logger.Error("replace tiers", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	h.audit.Log(r.Context(), store.ID, audit.Event{
		Action: "membership.tiers_updated", EntityType: "store", EntityID: store.ID.String(),
		Summary: "Update tier membership",
	})
	response.JSON(w, http.StatusOK, map[string]any{"ok": true})
}
