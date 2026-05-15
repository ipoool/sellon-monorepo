package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

type PlansHandler struct {
	plans  *repository.PlanRepo
	logger *slog.Logger
}

func NewPlansHandler(plans *repository.PlanRepo, logger *slog.Logger) *PlansHandler {
	return &PlansHandler{plans: plans, logger: logger}
}

type planDTO struct {
	Tier               string   `json:"tier"`
	Name               string   `json:"name"`
	MonthlyPriceCents  int64    `json:"monthly_price_cents"`
	YearlyPriceCents   int64    `json:"yearly_price_cents"`
	Currency           string   `json:"currency"`
	SortOrder          int      `json:"sort_order"`
	ProductLimit       int      `json:"product_limit"`
	StaffLimit         int      `json:"staff_limit"`
	OrderMonthlyLimit  int      `json:"order_monthly_limit"`
	PromoLimit         int      `json:"promo_limit"`
	Description        string   `json:"description"`
	Features           []string `json:"features"`
	CTALabel           string   `json:"cta_label"`
	PeriodMonthlyLabel string   `json:"period_monthly_label"`
	PeriodYearlyLabel  string   `json:"period_yearly_label"`
	Highlighted        bool     `json:"highlighted"`
	UpdatedAt          string   `json:"updated_at"`
}

func toPlanDTO(p repository.Plan) planDTO {
	features := p.Features
	if features == nil {
		features = []string{}
	}
	return planDTO{
		Tier:               p.Tier,
		Name:               p.Name,
		MonthlyPriceCents:  p.MonthlyPriceCents,
		YearlyPriceCents:   p.YearlyPriceCents,
		Currency:           p.Currency,
		SortOrder:          p.SortOrder,
		ProductLimit:       p.ProductLimit,
		StaffLimit:         p.StaffLimit,
		OrderMonthlyLimit:  p.OrderMonthlyLimit,
		PromoLimit:         p.PromoLimit,
		Description:        p.Description,
		Features:           features,
		CTALabel:           p.CTALabel,
		PeriodMonthlyLabel: p.PeriodMonthlyLabel,
		PeriodYearlyLabel:  p.PeriodYearlyLabel,
		Highlighted:        p.Highlighted,
		UpdatedAt:          p.UpdatedAt.Format(time.RFC3339),
	}
}

// normalizeLimit clamps a limit to the supported range: any negative
// value collapses to -1 (unlimited), and we cap at 1_000_000 to avoid
// silly numbers in the DB.
func normalizeLimit(v int) int {
	if v < 0 {
		return -1
	}
	if v > 1_000_000 {
		return 1_000_000
	}
	return v
}

// GET /api/v1/plans
//
// Public — landing page reads this to render pricing cards. No auth so
// the marketing site can SSR without a session.
func (h *PlansHandler) ListPublic(w http.ResponseWriter, r *http.Request) {
	plans, err := h.plans.List(r.Context())
	if err != nil {
		h.logger.Error("plans list", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	out := make([]planDTO, 0, len(plans))
	for _, p := range plans {
		out = append(out, toPlanDTO(p))
	}
	response.JSON(w, http.StatusOK, map[string]any{"plans": out})
}

// === Admin ===

type AdminPlansHandler struct {
	plans         *repository.PlanRepo
	platformAudit *repository.PlatformAuditRepo
	users         *repository.UserRepo
	logger        *slog.Logger
}

func NewAdminPlansHandler(
	plans *repository.PlanRepo,
	platformAudit *repository.PlatformAuditRepo,
	users *repository.UserRepo,
	logger *slog.Logger,
) *AdminPlansHandler {
	return &AdminPlansHandler{
		plans: plans, platformAudit: platformAudit, users: users, logger: logger,
	}
}

// GET /api/v1/admin/plans
func (h *AdminPlansHandler) List(w http.ResponseWriter, r *http.Request) {
	plans, err := h.plans.List(r.Context())
	if err != nil {
		h.logger.Error("admin plans list", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	out := make([]planDTO, 0, len(plans))
	for _, p := range plans {
		out = append(out, toPlanDTO(p))
	}
	response.JSON(w, http.StatusOK, map[string]any{"plans": out})
}

type updatePlanReq struct {
	Name               string   `json:"name"`
	MonthlyPriceCents  int64    `json:"monthly_price_cents"`
	YearlyPriceCents   int64    `json:"yearly_price_cents"`
	ProductLimit       int      `json:"product_limit"`
	StaffLimit         int      `json:"staff_limit"`
	OrderMonthlyLimit  int      `json:"order_monthly_limit"`
	PromoLimit         int      `json:"promo_limit"`
	Description        string   `json:"description"`
	Features           []string `json:"features"`
	CTALabel           string   `json:"cta_label"`
	PeriodMonthlyLabel string   `json:"period_monthly_label"`
	PeriodYearlyLabel  string   `json:"period_yearly_label"`
	Highlighted        bool     `json:"highlighted"`
}

// PUT /api/v1/admin/plans/{tier}
func (h *AdminPlansHandler) Update(w http.ResponseWriter, r *http.Request) {
	tier := strings.ToLower(strings.TrimSpace(chi.URLParam(r, "tier")))
	if tier != "free" && tier != "pro" && tier != "bisnis" {
		response.Error(w, http.StatusBadRequest, "tier tidak dikenal")
		return
	}
	var req updatePlanReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		response.Error(w, http.StatusBadRequest, "nama paket wajib diisi")
		return
	}
	if req.MonthlyPriceCents < 0 || req.YearlyPriceCents < 0 {
		response.Error(w, http.StatusBadRequest, "harga tidak boleh negatif")
		return
	}

	// Capture before-state for audit metadata diff.
	before, err := h.plans.Get(r.Context(), tier)
	if err != nil {
		if errors.Is(err, repository.ErrPlanNotFound) {
			response.Error(w, http.StatusNotFound, "paket tidak ditemukan")
			return
		}
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	features := req.Features
	if features == nil {
		features = []string{}
	}
	trimmed := make([]string, 0, len(features))
	for _, f := range features {
		f = strings.TrimSpace(f)
		if f != "" {
			trimmed = append(trimmed, f)
		}
	}

	updated, err := h.plans.Update(r.Context(), tier, repository.UpdatePlanInput{
		Name:               req.Name,
		MonthlyPriceCents:  req.MonthlyPriceCents,
		YearlyPriceCents:   req.YearlyPriceCents,
		ProductLimit:       normalizeLimit(req.ProductLimit),
		StaffLimit:         normalizeLimit(req.StaffLimit),
		OrderMonthlyLimit:  normalizeLimit(req.OrderMonthlyLimit),
		PromoLimit:         normalizeLimit(req.PromoLimit),
		Description:        strings.TrimSpace(req.Description),
		Features:           trimmed,
		CTALabel:           strings.TrimSpace(req.CTALabel),
		PeriodMonthlyLabel: strings.TrimSpace(req.PeriodMonthlyLabel),
		PeriodYearlyLabel:  strings.TrimSpace(req.PeriodYearlyLabel),
		Highlighted:        req.Highlighted,
	})
	if err != nil {
		h.logger.Error("admin plan update", "err", err, "tier", tier)
		response.Error(w, http.StatusInternalServerError, "gagal update")
		return
	}

	// Platform audit — record who changed pricing and what the deltas were.
	h.logPlatformPlanUpdate(r, tier, before, updated)

	response.JSON(w, http.StatusOK, map[string]any{"plan": toPlanDTO(*updated)})
}

func (h *AdminPlansHandler) logPlatformPlanUpdate(r *http.Request, tier string, before, after *repository.Plan) {
	in := repository.PlatformAuditInput{
		Action:  "plan.updated",
		Summary: "Update harga paket " + tier,
		Metadata: map[string]any{
			"tier":                         tier,
			"before_monthly_cents":         before.MonthlyPriceCents,
			"after_monthly_cents":          after.MonthlyPriceCents,
			"before_yearly_cents":          before.YearlyPriceCents,
			"after_yearly_cents":           after.YearlyPriceCents,
			"before_name":                  before.Name,
			"after_name":                   after.Name,
			"before_product_limit":         before.ProductLimit,
			"after_product_limit":          after.ProductLimit,
			"before_staff_limit":           before.StaffLimit,
			"after_staff_limit":            after.StaffLimit,
			"before_order_monthly_limit":   before.OrderMonthlyLimit,
			"after_order_monthly_limit":    after.OrderMonthlyLimit,
			"before_promo_limit":           before.PromoLimit,
			"after_promo_limit":            after.PromoLimit,
			"before_description":           before.Description,
			"after_description":            after.Description,
			"before_features":              before.Features,
			"after_features":               after.Features,
			"before_cta_label":             before.CTALabel,
			"after_cta_label":              after.CTALabel,
			"before_period_monthly_label":  before.PeriodMonthlyLabel,
			"after_period_monthly_label":   after.PeriodMonthlyLabel,
			"before_period_yearly_label":   before.PeriodYearlyLabel,
			"after_period_yearly_label":    after.PeriodYearlyLabel,
			"before_highlighted":           before.Highlighted,
			"after_highlighted":            after.Highlighted,
		},
	}
	if uid, ok := auth.UserIDFromContext(r.Context()); ok {
		in.ActorUserID = &uid
		if u, err := h.users.FindByID(r.Context(), uid); err == nil && u != nil {
			in.ActorEmail = u.Email
			in.ActorName = u.Name
		}
	}
	if err := h.platformAudit.Log(r.Context(), in); err != nil {
		h.logger.Error("admin plan audit", "err", err)
	}
}
