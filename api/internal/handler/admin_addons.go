package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/domain/feature"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

// AdminAddonsHandler lets an operator price the packages and retire one,
// without a deploy — the same contract /admin/plans has.
//
// It deliberately cannot change what a package CONTAINS. Composition lives
// in domain/feature, because a feature list edited beside the price is one
// that drifts from the map which actually enforces it.
type AdminAddonsHandler struct {
	addons        *repository.AddonRepo
	platformAudit *repository.PlatformAuditRepo
	users         *repository.UserRepo
	logger        *slog.Logger
}

func NewAdminAddonsHandler(
	addons *repository.AddonRepo,
	platformAudit *repository.PlatformAuditRepo,
	users *repository.UserRepo,
	logger *slog.Logger,
) *AdminAddonsHandler {
	return &AdminAddonsHandler{
		addons: addons, platformAudit: platformAudit, users: users, logger: logger,
	}
}

type adminAddonDTO struct {
	Code        string `json:"code"`
	Name        string `json:"name"`
	Description string `json:"description"`

	MonthlyPriceCents int64 `json:"monthly_price_cents"`
	YearlyPriceCents  int64 `json:"yearly_price_cents"`

	IsActive  bool `json:"is_active"`
	SortOrder int  `json:"sort_order"`

	// Read-only: what the package contains, so the editor can show what is
	// being priced without letting anyone edit it here.
	Features []string `json:"features"`
	// How many stores hold it right now. Retiring something people pay for
	// should be a visible decision, not a quiet one.
	ActiveStores int `json:"active_stores"`
}

// GET /api/v1/admin/addons
func (h *AdminAddonsHandler) List(w http.ResponseWriter, r *http.Request) {
	list, err := h.addons.ListAddons(r.Context(), true)
	if err != nil {
		h.logger.Error("admin list addons", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	counts, err := h.addons.CountActiveByAddon(r.Context())
	if err != nil {
		h.logger.Error("admin addon counts", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	out := make([]adminAddonDTO, 0, len(list))
	for _, a := range list {
		out = append(out, adminAddonDTO{
			Code: a.Code, Name: a.Name, Description: a.Description,
			MonthlyPriceCents: a.MonthlyPriceCents,
			YearlyPriceCents:  a.YearlyPriceCents,
			IsActive:          a.IsActive,
			SortOrder:         a.SortOrder,
			Features:          featureCodes(feature.Addon(a.Code)),
			ActiveStores:      counts[a.Code],
		})
	}
	response.JSON(w, http.StatusOK, map[string]any{"addons": out})
}

type updateAddonReq struct {
	Name              string `json:"name"`
	Description       string `json:"description"`
	MonthlyPriceCents int64  `json:"monthly_price_cents"`
	YearlyPriceCents  int64  `json:"yearly_price_cents"`
	IsActive          bool   `json:"is_active"`
	SortOrder         int    `json:"sort_order"`
}

// PUT /api/v1/admin/addons/{code}
func (h *AdminAddonsHandler) Update(w http.ResponseWriter, r *http.Request) {
	code := strings.ToLower(strings.TrimSpace(chi.URLParam(r, "code")))

	var req updateAddonReq
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "body tidak valid")
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

	// Read first, so the audit entry can say what the price WAS. A pricing
	// change with no before-value is a log line nobody can act on.
	before, err := h.addons.FindAddon(r.Context(), code)
	if errors.Is(err, repository.ErrAddonNotFound) {
		response.Error(w, http.StatusNotFound, "paket tidak ditemukan")
		return
	}
	if err != nil {
		h.logger.Error("admin addon find", "err", err, "code", code)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	after, err := h.addons.UpdateAddon(r.Context(), repository.Addon{
		Code:              code,
		Name:              req.Name,
		Description:       strings.TrimSpace(req.Description),
		MonthlyPriceCents: req.MonthlyPriceCents,
		YearlyPriceCents:  req.YearlyPriceCents,
		IsActive:          req.IsActive,
		SortOrder:         req.SortOrder,
	})
	if err != nil {
		h.logger.Error("admin addon update", "err", err, "code", code)
		response.Error(w, http.StatusInternalServerError, "gagal menyimpan")
		return
	}

	h.audit(r, "addon.updated", "Update paket tambahan "+code, map[string]any{
		"code":                 code,
		"before_monthly_cents": before.MonthlyPriceCents,
		"after_monthly_cents":  after.MonthlyPriceCents,
		"before_yearly_cents":  before.YearlyPriceCents,
		"after_yearly_cents":   after.YearlyPriceCents,
		"before_active":        before.IsActive,
		"after_active":         after.IsActive,
	})

	response.JSON(w, http.StatusOK, map[string]any{
		"addon": adminAddonDTO{
			Code: after.Code, Name: after.Name, Description: after.Description,
			MonthlyPriceCents: after.MonthlyPriceCents,
			YearlyPriceCents:  after.YearlyPriceCents,
			IsActive:          after.IsActive,
			SortOrder:         after.SortOrder,
			Features:          featureCodes(feature.Addon(after.Code)),
		},
	})
}

func (h *AdminAddonsHandler) audit(r *http.Request, action, summary string, meta map[string]any) {
	in := repository.PlatformAuditInput{Action: action, Summary: summary, Metadata: meta}
	if uid, ok := auth.UserIDFromContext(r.Context()); ok {
		in.ActorUserID = &uid
		if u, err := h.users.FindByID(r.Context(), uid); err == nil {
			in.ActorEmail = u.Email
			in.ActorName = u.Name
		}
	}
	if err := h.platformAudit.Log(r.Context(), in); err != nil {
		h.logger.Error("platform audit insert", "err", err, "action", action)
	}
}
