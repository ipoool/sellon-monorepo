package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/sellon/sellon/api/internal/audit"
	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

type PromoHandler struct {
	promos *repository.PromoRepo
	stores *repository.StoreRepo
	subs   *repository.SubscriptionRepo
	plans  *repository.PlanRepo
	audit  *audit.Logger
	logger *slog.Logger
}

func NewPromoHandler(
	promos *repository.PromoRepo,
	stores *repository.StoreRepo,
	subs *repository.SubscriptionRepo,
	plans *repository.PlanRepo,
	audit *audit.Logger,
	logger *slog.Logger,
) *PromoHandler {
	return &PromoHandler{
		promos: promos, stores: stores,
		subs: subs, plans: plans,
		audit: audit, logger: logger,
	}
}

type promoDTO struct {
	ID               string  `json:"id"`
	Code             string  `json:"code"`
	Type             string  `json:"type"`
	Value            int64   `json:"value"`
	MinPurchaseCents int64   `json:"min_purchase_cents"`
	MaxUsage         int     `json:"max_usage"`
	UsedCount        int     `json:"used_count"`
	StartsAt         *string `json:"starts_at"`
	ExpiresAt        *string `json:"expires_at"`
	IsActive         bool    `json:"is_active"`
	CreatedAt        string  `json:"created_at"`
}

func toPromoDTO(p repository.Promo) promoDTO {
	out := promoDTO{
		ID:               p.ID.String(),
		Code:             p.Code,
		Type:             string(p.Type),
		Value:            p.Value,
		MinPurchaseCents: p.MinPurchaseCents,
		MaxUsage:         p.MaxUsage,
		UsedCount:        p.UsedCount,
		IsActive:         p.IsActive,
		CreatedAt:        p.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
	if p.StartsAt != nil {
		s := p.StartsAt.Format("2006-01-02T15:04:05Z07:00")
		out.StartsAt = &s
	}
	if p.ExpiresAt != nil {
		s := p.ExpiresAt.Format("2006-01-02T15:04:05Z07:00")
		out.ExpiresAt = &s
	}
	return out
}

func (h *PromoHandler) storeFor(r *http.Request) (*repository.Store, error) {
	uid, _ := auth.UserIDFromContext(r.Context())
	return h.stores.FindByOwnerID(r.Context(), uid)
}

// GET /api/v1/promos?limit=&offset=
func (h *PromoHandler) List(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if errors.Is(err, repository.ErrStoreNotFound) {
		response.JSON(w, http.StatusOK, map[string]any{
			"promos": []promoDTO{}, "total": 0,
		})
		return
	}
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	if limit == 0 {
		limit = 25
	}
	offset, _ := strconv.Atoi(q.Get("offset"))

	rows, total, err := h.promos.ListByStore(r.Context(), store.ID, limit, offset)
	if err != nil {
		h.logger.Error("list promos", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	out := make([]promoDTO, 0, len(rows))
	for _, p := range rows {
		out = append(out, toPromoDTO(p))
	}
	response.JSON(w, http.StatusOK, map[string]any{
		"promos": out, "total": total,
	})
}

// GET /api/v1/promos/{id}
func (h *PromoHandler) Get(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "id invalid")
		return
	}
	p, err := h.promos.FindByID(r.Context(), store.ID, id)
	if err != nil {
		response.Error(w, http.StatusNotFound, "promo tidak ditemukan")
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"promo": toPromoDTO(*p)})
}

type promoReq struct {
	Code             string  `json:"code"`
	Type             string  `json:"type"`
	Value            int64   `json:"value"`
	MinPurchaseCents int64   `json:"min_purchase_cents"`
	MaxUsage         int     `json:"max_usage"`
	StartsAt         *string `json:"starts_at"` // ISO date or empty
	ExpiresAt        *string `json:"expires_at"`
	IsActive         bool    `json:"is_active"`
}

func (req *promoReq) toInput() (repository.PromoInput, error) {
	in := repository.PromoInput{
		Code:             strings.TrimSpace(req.Code),
		Type:             repository.PromoType(req.Type),
		Value:            req.Value,
		MinPurchaseCents: req.MinPurchaseCents,
		MaxUsage:         req.MaxUsage,
		IsActive:         req.IsActive,
	}
	switch in.Type {
	case repository.PromoPercent, repository.PromoFixed, repository.PromoFreeShipping:
	default:
		return in, errors.New("type tidak valid")
	}
	if in.Code == "" {
		return in, errors.New("kode wajib diisi")
	}
	if len(in.Code) > 30 {
		return in, errors.New("kode terlalu panjang (maks 30 karakter)")
	}
	if in.Type == repository.PromoPercent && (in.Value < 1 || in.Value > 100) {
		return in, errors.New("persentase harus antara 1-100")
	}
	if in.Type == repository.PromoFixed && in.Value <= 0 {
		return in, errors.New("nominal diskon harus lebih dari 0")
	}
	if in.MaxUsage < 0 {
		return in, errors.New("max usage tidak boleh negatif")
	}
	if in.MinPurchaseCents < 0 {
		return in, errors.New("minimum belanja tidak boleh negatif")
	}
	parseTime := func(s *string) (*time.Time, error) {
		if s == nil || strings.TrimSpace(*s) == "" {
			return nil, nil
		}
		// Accept date-only ("2026-05-09") or full ISO with time.
		v := strings.TrimSpace(*s)
		if t, err := time.Parse("2006-01-02", v); err == nil {
			return &t, nil
		}
		t, err := time.Parse(time.RFC3339, v)
		if err != nil {
			return nil, errors.New("format tanggal tidak valid")
		}
		return &t, nil
	}
	startsAt, err := parseTime(req.StartsAt)
	if err != nil {
		return in, err
	}
	expiresAt, err := parseTime(req.ExpiresAt)
	if err != nil {
		return in, err
	}
	if startsAt != nil && expiresAt != nil && expiresAt.Before(*startsAt) {
		return in, errors.New("tanggal kadaluarsa harus setelah tanggal mulai")
	}
	in.StartsAt = startsAt
	in.ExpiresAt = expiresAt
	return in, nil
}

// POST /api/v1/promos
func (h *PromoHandler) Create(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}

	// Tier promo-quota check. Bounded probe — fails open on lookup
	// errors so a transient DB hiccup never accidentally blocks a paying
	// seller.
	if sub, err := h.subs.GetOrCreate(r.Context(), store.ID); err == nil {
		if limit := promoLimitForSub(sub); limit >= 0 {
			over, err := h.promos.HasAtLeast(r.Context(), store.ID, limit)
			if err == nil && over {
				response.Error(w, http.StatusPaymentRequired,
					"Limit promo tier "+sub.Plan+" ("+strconv.Itoa(limit)+
						") sudah tercapai. Upgrade untuk lebih banyak kode promo.")
				return
			}
		}
	}

	var req promoReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	in, err := req.toInput()
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	p, err := h.promos.Create(r.Context(), store.ID, in)
	if errors.Is(err, repository.ErrPromoCodeDuplicate) {
		response.Error(w, http.StatusConflict, "kode promo sudah dipakai")
		return
	}
	if err != nil {
		h.logger.Error("create promo", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	h.audit.Log(r.Context(), store.ID, audit.Event{
		Action:     "promo.created",
		EntityType: "promo",
		EntityID:   p.ID.String(),
		Summary:    "Tambah promo " + p.Code,
		Metadata: map[string]any{
			"code":  p.Code,
			"type":  string(p.Type),
			"value": p.Value,
		},
	})
	response.JSON(w, http.StatusCreated, map[string]any{"promo": toPromoDTO(*p)})
}

// PUT /api/v1/promos/{id}
func (h *PromoHandler) Update(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "id invalid")
		return
	}
	var req promoReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	in, err := req.toInput()
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	p, err := h.promos.Update(r.Context(), store.ID, id, in)
	if errors.Is(err, repository.ErrPromoNotFound) {
		response.Error(w, http.StatusNotFound, "promo tidak ditemukan")
		return
	}
	if errors.Is(err, repository.ErrPromoCodeDuplicate) {
		response.Error(w, http.StatusConflict, "kode promo sudah dipakai")
		return
	}
	if err != nil {
		h.logger.Error("update promo", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	h.audit.Log(r.Context(), store.ID, audit.Event{
		Action:     "promo.updated",
		EntityType: "promo",
		EntityID:   p.ID.String(),
		Summary:    "Update promo " + p.Code,
		Metadata: map[string]any{
			"code":  p.Code,
			"type":  string(p.Type),
			"value": p.Value,
		},
	})
	response.JSON(w, http.StatusOK, map[string]any{"promo": toPromoDTO(*p)})
}

// DELETE /api/v1/promos/{id}
func (h *PromoHandler) Delete(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "id invalid")
		return
	}
	// Capture code for audit summary before delete cascades.
	preCode := ""
	if existing, _ := h.promos.FindByID(r.Context(), store.ID, id); existing != nil {
		preCode = existing.Code
	}
	if err := h.promos.Delete(r.Context(), store.ID, id); err != nil {
		if errors.Is(err, repository.ErrPromoNotFound) {
			response.Error(w, http.StatusNotFound, "promo tidak ditemukan")
			return
		}
		h.logger.Error("delete promo", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	summary := "Hapus promo"
	if preCode != "" {
		summary = "Hapus promo " + preCode
	}
	h.audit.Log(r.Context(), store.ID, audit.Event{
		Action:     "promo.deleted",
		EntityType: "promo",
		EntityID:   id.String(),
		Summary:    summary,
		Metadata:   map[string]any{"code": preCode},
	})
	response.JSON(w, http.StatusOK, map[string]any{"ok": true})
}
