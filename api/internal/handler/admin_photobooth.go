package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

// AdminPhotoBoothHandler is the operator side of PhotoBoost: register booths,
// issue and revoke device credentials, edit pricing, and read the session
// ledger. Mounted behind RequireAdmin.
type AdminPhotoBoothHandler struct {
	booths        *repository.PhotoBoothRepo
	sessions      *repository.PhotoBoothSessionRepo
	users         *repository.UserRepo
	platformAudit *repository.PlatformAuditRepo
	logger        *slog.Logger
}

func NewAdminPhotoBoothHandler(
	booths *repository.PhotoBoothRepo,
	sessions *repository.PhotoBoothSessionRepo,
	users *repository.UserRepo,
	platformAudit *repository.PlatformAuditRepo,
	logger *slog.Logger,
) *AdminPhotoBoothHandler {
	return &AdminPhotoBoothHandler{
		booths: booths, sessions: sessions, users: users,
		platformAudit: platformAudit, logger: logger,
	}
}

// === Booths ===

// GET /api/v1/admin/photobooth/booths
func (h *AdminPhotoBoothHandler) ListBooths(w http.ResponseWriter, r *http.Request) {
	booths, err := h.booths.ListBooths(r.Context())
	if err != nil {
		h.logger.Error("admin list booths", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	settings, err := h.booths.GetSettings(r.Context())
	if err != nil {
		h.logger.Error("admin booth settings", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	stats, err := h.sessions.FleetStats(r.Context())
	if err != nil {
		h.logger.Error("admin fleet stats", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	out := make([]map[string]any, 0, len(booths))
	for i := range booths {
		b := &booths[i]
		tokens, err := h.booths.ListDeviceTokens(r.Context(), b.ID)
		if err != nil {
			h.logger.Error("admin list tokens", "err", err, "booth", b.Code)
			tokens = nil
		}
		eff, err := h.booths.EffectiveConfigFor(r.Context(), b.ID)
		if err != nil {
			h.logger.Error("admin effective config", "err", err, "booth", b.Code)
		}
		out = append(out, adminBoothDTO(b, eff, tokens))
	}

	response.JSON(w, http.StatusOK, map[string]any{
		"booths":   out,
		"settings": adminSettingsDTO(settings),
		"stats": map[string]any{
			"active_booths":     stats.ActiveBooths,
			"offline_booths":    stats.OfflineBooths,
			"sessions_today":    stats.SessionsToday,
			"gross_today_cents": stats.GrossTodayCent,
		},
	})
}

type adminBoothReq struct {
	Code     string `json:"code"`
	Name     string `json:"name"`
	Location string `json:"location"`
	Status   string `json:"status"`
	Notes    string `json:"notes"`

	// Pointers because null means "inherit the platform default" rather
	// than zero. Sending 0 would be a real (and nonsensical) override.
	PriceCents            *int64              `json:"price_cents"`
	ShotsCount            *int                `json:"shots_count"`
	PrintCopies           *int                `json:"print_copies"`
	SessionTimeoutSeconds *int                `json:"session_timeout_seconds"`
	QRISExpiryMinutes     *int                `json:"qris_expiry_minutes"`
	Frames                *[]repository.Frame `json:"frames"`
}

// POST /api/v1/admin/photobooth/booths
func (h *AdminPhotoBoothHandler) CreateBooth(w http.ResponseWriter, r *http.Request) {
	var req adminBoothReq
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "body tidak valid")
		return
	}
	code := strings.ToUpper(strings.TrimSpace(req.Code))
	if !validBoothCode(code) {
		response.Error(w, http.StatusBadRequest, "kode booth harus 2-8 huruf/angka kapital")
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		response.Error(w, http.StatusBadRequest, "nama booth wajib diisi")
		return
	}
	if msg := validateBoothOverrides(req); msg != "" {
		response.Error(w, http.StatusBadRequest, msg)
		return
	}

	actor, _ := adminActorID(r)
	b, err := h.booths.CreateBooth(r.Context(), repository.CreateBoothInput{
		Code: code, Name: name,
		Location:              strings.TrimSpace(req.Location),
		Notes:                 truncate(strings.TrimSpace(req.Notes), 500),
		CreatedBy:             actor,
		PriceCents:            req.PriceCents,
		ShotsCount:            req.ShotsCount,
		PrintCopies:           req.PrintCopies,
		SessionTimeoutSeconds: req.SessionTimeoutSeconds,
		QRISExpiryMinutes:     req.QRISExpiryMinutes,
		Frames:                derefFrames(req.Frames),
	})
	if errors.Is(err, repository.ErrBoothCodeTaken) {
		response.Error(w, http.StatusConflict, "kode booth sudah dipakai")
		return
	}
	if err != nil {
		h.logger.Error("admin create booth", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal membuat booth")
		return
	}
	h.audit(r, "photobooth.booth_created", "Booth "+b.Code+" dibuat",
		map[string]any{"booth_id": b.ID.String(), "code": b.Code})
	response.JSON(w, http.StatusCreated, adminBoothDTO(b, nil, nil))
}

// PUT /api/v1/admin/photobooth/booths/{id}
func (h *AdminPhotoBoothHandler) UpdateBooth(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "id tidak valid")
		return
	}
	var req adminBoothReq
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "body tidak valid")
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		response.Error(w, http.StatusBadRequest, "nama booth wajib diisi")
		return
	}
	status := strings.TrimSpace(req.Status)
	switch status {
	case "active", "paused", "retired":
	default:
		response.Error(w, http.StatusBadRequest, "status harus active, paused, atau retired")
		return
	}
	if msg := validateBoothOverrides(req); msg != "" {
		response.Error(w, http.StatusBadRequest, msg)
		return
	}

	b, err := h.booths.UpdateBooth(r.Context(), repository.UpdateBoothInput{
		ID: id, Name: name,
		Location:              strings.TrimSpace(req.Location),
		Status:                status,
		Notes:                 truncate(strings.TrimSpace(req.Notes), 500),
		PriceCents:            req.PriceCents,
		ShotsCount:            req.ShotsCount,
		PrintCopies:           req.PrintCopies,
		SessionTimeoutSeconds: req.SessionTimeoutSeconds,
		QRISExpiryMinutes:     req.QRISExpiryMinutes,
		Frames:                derefFrames(req.Frames),
		ClearFrames:           req.Frames == nil,
	})
	if errors.Is(err, repository.ErrBoothNotFound) {
		response.Error(w, http.StatusNotFound, "booth tidak ditemukan")
		return
	}
	if err != nil {
		h.logger.Error("admin update booth", "err", err, "booth", id)
		response.Error(w, http.StatusInternalServerError, "gagal menyimpan booth")
		return
	}
	h.audit(r, "photobooth.booth_updated", "Booth "+b.Code+" diperbarui",
		map[string]any{"booth_id": b.ID.String(), "code": b.Code, "status": b.Status})
	response.JSON(w, http.StatusOK, adminBoothDTO(b, nil, nil))
}

// === Device tokens ===

type issueTokenReq struct {
	Label string `json:"label"`
}

// POST /api/v1/admin/photobooth/booths/{id}/tokens
//
// The raw token is in this response and nowhere else, ever again. The audit
// entry records the prefix only.
func (h *AdminPhotoBoothHandler) IssueToken(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "id tidak valid")
		return
	}
	var req issueTokenReq
	_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 2<<10)).Decode(&req)

	b, err := h.booths.FindBoothByID(r.Context(), id)
	if err != nil {
		response.Error(w, http.StatusNotFound, "booth tidak ditemukan")
		return
	}
	actor, _ := adminActorID(r)
	raw, tok, err := h.booths.IssueDeviceToken(r.Context(), id,
		truncate(strings.TrimSpace(req.Label), 60), actor)
	if err != nil {
		h.logger.Error("admin issue token", "err", err, "booth", id)
		response.Error(w, http.StatusInternalServerError, "gagal menerbitkan token")
		return
	}
	h.audit(r, "photobooth.token_issued",
		"Token perangkat diterbitkan untuk booth "+b.Code,
		map[string]any{"booth_id": id.String(), "code": b.Code, "token_prefix": tok.TokenPrefix})

	response.JSON(w, http.StatusCreated, map[string]any{
		"id":     tok.ID,
		"prefix": tok.TokenPrefix,
		"label":  tok.Label,
		// Shown once. The client must tell the operator to copy it now.
		"token": raw,
	})
}

// POST /api/v1/admin/photobooth/tokens/{tokenID}/revoke
func (h *AdminPhotoBoothHandler) RevokeToken(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "tokenID"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "id tidak valid")
		return
	}
	actor, _ := adminActorID(r)
	if err := h.booths.RevokeDeviceToken(r.Context(), id, actor); err != nil {
		h.logger.Error("admin revoke token", "err", err, "token", id)
		response.Error(w, http.StatusInternalServerError, "gagal mencabut token")
		return
	}
	h.audit(r, "photobooth.token_revoked", "Token perangkat dicabut",
		map[string]any{"token_id": id.String()})
	response.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

// === Platform settings ===

type adminSettingsReq struct {
	PriceCents            int64              `json:"price_cents"`
	ShotsCount            int                `json:"shots_count"`
	PrintCopies           int                `json:"print_copies"`
	SessionTimeoutSeconds int                `json:"session_timeout_seconds"`
	QRISExpiryMinutes     int                `json:"qris_expiry_minutes"`
	Frames                []repository.Frame `json:"frames"`
}

// PUT /api/v1/admin/photobooth/settings
func (h *AdminPhotoBoothHandler) UpdateSettings(w http.ResponseWriter, r *http.Request) {
	var req adminSettingsReq
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 256<<10)).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "body tidak valid")
		return
	}
	if req.PriceCents < 0 {
		response.Error(w, http.StatusBadRequest, "harga tidak boleh negatif")
		return
	}
	if req.ShotsCount < 1 || req.ShotsCount > 12 {
		response.Error(w, http.StatusBadRequest, "jumlah foto harus 1-12")
		return
	}
	if req.PrintCopies < 1 || req.PrintCopies > 5 {
		response.Error(w, http.StatusBadRequest, "jumlah cetakan harus 1-5")
		return
	}
	if req.SessionTimeoutSeconds < 30 || req.SessionTimeoutSeconds > 3600 {
		response.Error(w, http.StatusBadRequest, "timeout sesi harus 30-3600 detik")
		return
	}
	if req.QRISExpiryMinutes < 1 || req.QRISExpiryMinutes > 120 {
		response.Error(w, http.StatusBadRequest, "masa berlaku QRIS harus 1-120 menit")
		return
	}

	actor, _ := adminActorID(r)
	if err := h.booths.UpdateSettings(r.Context(), repository.UpdateSettingsInput{
		PriceCents:            req.PriceCents,
		ShotsCount:            req.ShotsCount,
		PrintCopies:           req.PrintCopies,
		SessionTimeoutSeconds: req.SessionTimeoutSeconds,
		QRISExpiryMinutes:     req.QRISExpiryMinutes,
		Frames:                req.Frames,
		UpdatedBy:             actor,
	}); err != nil {
		h.logger.Error("admin update photobooth settings", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal menyimpan pengaturan")
		return
	}
	h.audit(r, "photobooth.settings_updated", "Pengaturan PhotoBoost diperbarui",
		map[string]any{"price_cents": req.PriceCents, "shots_count": req.ShotsCount})

	s, err := h.booths.GetSettings(r.Context())
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	response.JSON(w, http.StatusOK, adminSettingsDTO(s))
}

// === Sessions ledger ===

// GET /api/v1/admin/photobooth/sessions
func (h *AdminPhotoBoothHandler) ListSessions(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	offset, _ := strconv.Atoi(q.Get("offset"))

	f := repository.AdminSessionFilter{
		Search:      strings.TrimSpace(q.Get("q")),
		Status:      strings.TrimSpace(q.Get("status")),
		NeedsReview: q.Get("review") == "1",
		Limit:       limit,
		Offset:      offset,
	}
	if raw := strings.TrimSpace(q.Get("booth_id")); raw != "" {
		if id, err := uuid.Parse(raw); err == nil {
			f.BoothID = &id
		}
	}

	rows, total, sum, err := h.sessions.AdminListSessions(r.Context(), f)
	if err != nil {
		h.logger.Error("admin list photobooth sessions", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	out := make([]map[string]any, 0, len(rows))
	for i := range rows {
		out = append(out, adminSessionDTO(&rows[i]))
	}
	response.JSON(w, http.StatusOK, map[string]any{
		"sessions": out,
		"total":    total,
		"summary": map[string]any{
			"gross_cents":     sum.GrossCents,
			"paid_count":      sum.PaidCount,
			"completed_count": sum.CompletedCount,
			"failed_count":    sum.FailedCount,
			"review_count":    sum.ReviewCount,
		},
	})
}

// === DTOs and helpers ===

func adminBoothDTO(b *repository.Booth, eff *repository.EffectiveConfig, tokens []repository.DeviceToken) map[string]any {
	out := map[string]any{
		"id":       b.ID,
		"code":     b.Code,
		"name":     b.Name,
		"location": b.Location,
		"status":   b.Status,
		"notes":    b.Notes,
		// The raw overrides, so the UI can show inherited values as muted
		// placeholders rather than pretending they were set here.
		"price_cents":             b.PriceCents,
		"shots_count":             b.ShotsCount,
		"print_copies":            b.PrintCopies,
		"session_timeout_seconds": b.SessionTimeoutSeconds,
		"qris_expiry_minutes":     b.QRISExpiryMinutes,
		"frames":                  b.Frames,
		"app_version":             b.AppVersion,
		"printer_ok":              b.PrinterOK,
		"paper_low":               b.PaperLow,
		"last_seen_at":            b.LastSeenAt,
		"created_at":              b.CreatedAt,
	}
	if eff != nil {
		out["effective"] = boothConfigDTO(eff)
	}
	if tokens != nil {
		list := make([]map[string]any, 0, len(tokens))
		for _, t := range tokens {
			list = append(list, map[string]any{
				"id":           t.ID,
				"prefix":       t.TokenPrefix,
				"label":        t.Label,
				"created_at":   t.CreatedAt,
				"last_used_at": t.LastUsedAt,
				"revoked_at":   t.RevokedAt,
			})
		}
		out["tokens"] = list
	}
	return out
}

func adminSettingsDTO(s *repository.PhotoBoothSettings) map[string]any {
	return map[string]any{
		"price_cents":             s.PriceCents,
		"shots_count":             s.ShotsCount,
		"print_copies":            s.PrintCopies,
		"session_timeout_seconds": s.SessionTimeoutSeconds,
		"qris_expiry_minutes":     s.QRISExpiryMinutes,
		"frames":                  s.Frames,
		"updated_at":              s.UpdatedAt,
	}
}

// adminSessionDTO is wider than the booth's view: this is the operator's
// window into an unattended fleet, so the review flag, the failure reason and
// the whole timestamp ladder are the point.
func adminSessionDTO(r *repository.AdminSessionRow) map[string]any {
	s := &r.PhotoBoothSession
	return map[string]any{
		"id":                      s.ID,
		"session_number":          s.SessionNumber,
		"booth_id":                s.BoothID,
		"booth_code":              r.BoothCodeJoined,
		"booth_name":              r.BoothNameJoined,
		"amount_cents":            s.AmountCents,
		"shots_planned":           s.ShotsPlanned,
		"shots_taken":             s.ShotsTaken,
		"print_copies":            s.PrintCopies,
		"frame_id":                s.FrameID,
		"status":                  s.Status,
		"payment_status":          s.PaymentStatus,
		"payment_method":          s.PaymentMethod,
		"provider_transaction_id": s.ProviderTransactionID,
		"needs_review":            s.NeedsReview,
		"review_reason":           s.ReviewReason,
		"failure_reason":          s.FailureReason,
		"result_url":              s.ResultURL,
		"app_version":             s.AppVersion,
		"created_at":              s.CreatedAt,
		"charged_at":              s.ChargedAt,
		"paid_at":                 s.PaidAt,
		"captured_at":             s.CapturedAt,
		"printed_at":              s.PrintedAt,
		"completed_at":            s.CompletedAt,
		"expired_at":              s.ExpiredAt,
		"qr_expires_at":           s.QRExpiresAt,
	}
}

func validBoothCode(code string) bool {
	if len(code) < 2 || len(code) > 8 {
		return false
	}
	for _, c := range code {
		if !(c >= 'A' && c <= 'Z') && !(c >= '0' && c <= '9') {
			return false
		}
	}
	return true
}

// validateBoothOverrides mirrors the CHECK constraints in migration 0108.
// Both exist on purpose: the database is the backstop, this is the error
// message a human can act on.
func validateBoothOverrides(req adminBoothReq) string {
	if req.PriceCents != nil && *req.PriceCents < 0 {
		return "harga tidak boleh negatif"
	}
	if req.ShotsCount != nil && (*req.ShotsCount < 1 || *req.ShotsCount > 12) {
		return "jumlah foto harus 1-12"
	}
	if req.PrintCopies != nil && (*req.PrintCopies < 1 || *req.PrintCopies > 5) {
		return "jumlah cetakan harus 1-5"
	}
	if req.SessionTimeoutSeconds != nil && (*req.SessionTimeoutSeconds < 30 || *req.SessionTimeoutSeconds > 3600) {
		return "timeout sesi harus 30-3600 detik"
	}
	if req.QRISExpiryMinutes != nil && (*req.QRISExpiryMinutes < 1 || *req.QRISExpiryMinutes > 120) {
		return "masa berlaku QRIS harus 1-120 menit"
	}
	return ""
}

func derefFrames(f *[]repository.Frame) []repository.Frame {
	if f == nil {
		return nil
	}
	return *f
}

// adminActorID returns the acting admin's user id, or uuid.Nil in the
// (RequireAdmin-prevented) case where no session is on the context.
func adminActorID(r *http.Request) (uuid.UUID, bool) {
	return auth.UserIDFromContext(r.Context())
}

// audit records an operator action. PhotoBoost is a platform business, so
// these go to platform_audit_log — never the tenant audit_log.
func (h *AdminPhotoBoothHandler) audit(r *http.Request, action, summary string, meta map[string]any) {
	in := repository.PlatformAuditInput{
		Action:   action,
		Summary:  summary,
		Metadata: meta,
	}
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
