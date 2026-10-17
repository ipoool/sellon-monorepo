package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

// AdminPartnersHandler is the operator side of the referral programme:
// register partners, read what they brought in, and settle what they are
// owed. Mounted behind RequireAdmin.
type AdminPartnersHandler struct {
	partners      *repository.PartnerRepo
	users         *repository.UserRepo
	platformAudit *repository.PlatformAuditRepo
	logger        *slog.Logger
}

func NewAdminPartnersHandler(
	partners *repository.PartnerRepo,
	users *repository.UserRepo,
	platformAudit *repository.PlatformAuditRepo,
	logger *slog.Logger,
) *AdminPartnersHandler {
	return &AdminPartnersHandler{
		partners: partners, users: users,
		platformAudit: platformAudit, logger: logger,
	}
}

var partnerCodeRe = regexp.MustCompile(`^[A-Z0-9][A-Z0-9-]{1,23}$`)

type partnerReq struct {
	Code          string `json:"code"`
	Name          string `json:"name"`
	ContactName   string `json:"contact_name"`
	ContactEmail  string `json:"contact_email"`
	ContactPhone  string `json:"contact_phone"`
	CommissionBps int    `json:"commission_bps"`
	Status        string `json:"status"`
	Notes         string `json:"notes"`
}

func (q partnerReq) validate(requireCode bool) string {
	if requireCode && !partnerCodeRe.MatchString(strings.ToUpper(strings.TrimSpace(q.Code))) {
		return "kode partner harus 2-24 huruf/angka kapital"
	}
	if strings.TrimSpace(q.Name) == "" {
		return "nama partner wajib diisi"
	}
	if q.CommissionBps < 0 || q.CommissionBps > 10000 {
		return "komisi harus antara 0% dan 100%"
	}
	return ""
}

// GET /api/v1/admin/partners
func (h *AdminPartnersHandler) List(w http.ResponseWriter, r *http.Request) {
	list, err := h.partners.ListPartners(r.Context())
	if err != nil {
		h.logger.Error("admin list partners", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	out := make([]map[string]any, 0, len(list))
	var owed, paid int64
	var referrals, converted int
	for i := range list {
		out = append(out, partnerDTO(&list[i]))
		owed += list[i].OwedCents
		paid += list[i].PaidCents
		referrals += list[i].Referrals
		converted += list[i].Converted
	}
	response.JSON(w, http.StatusOK, map[string]any{
		"partners": out,
		"totals": map[string]any{
			"partners":   len(list),
			"referrals":  referrals,
			"converted":  converted,
			"owed_cents": owed,
			"paid_cents": paid,
		},
	})
}

// POST /api/v1/admin/partners
func (h *AdminPartnersHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req partnerReq
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "body tidak valid")
		return
	}
	if msg := req.validate(true); msg != "" {
		response.Error(w, http.StatusBadRequest, msg)
		return
	}
	actor, _ := adminActorID(r)
	p, err := h.partners.CreatePartner(r.Context(), repository.CreatePartnerInput{
		Code:          strings.ToUpper(strings.TrimSpace(req.Code)),
		Name:          req.Name,
		ContactName:   req.ContactName,
		ContactEmail:  req.ContactEmail,
		ContactPhone:  req.ContactPhone,
		CommissionBps: req.CommissionBps,
		Notes:         req.Notes,
		CreatedBy:     actor,
	})
	if errors.Is(err, repository.ErrPartnerCodeTaken) {
		response.Error(w, http.StatusConflict, "kode partner sudah dipakai")
		return
	}
	if err != nil {
		h.logger.Error("admin create partner", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal menyimpan partner")
		return
	}
	h.audit(r, "partner.created", "Partner "+p.Code+" didaftarkan",
		map[string]any{"partner_id": p.ID.String(), "code": p.Code,
			"commission_bps": p.CommissionBps})
	response.JSON(w, http.StatusCreated, partnerDTOFlat(p))
}

// PUT /api/v1/admin/partners/{id}
func (h *AdminPartnersHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "id tidak valid")
		return
	}
	var req partnerReq
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "body tidak valid")
		return
	}
	if msg := req.validate(false); msg != "" {
		response.Error(w, http.StatusBadRequest, msg)
		return
	}
	status := strings.TrimSpace(req.Status)
	switch status {
	case "active", "paused", "ended":
	default:
		response.Error(w, http.StatusBadRequest, "status tidak dikenal")
		return
	}

	p, err := h.partners.UpdatePartner(r.Context(), repository.UpdatePartnerInput{
		ID: id, Name: req.Name, ContactName: req.ContactName,
		ContactEmail: req.ContactEmail, ContactPhone: req.ContactPhone,
		CommissionBps: req.CommissionBps, Status: status, Notes: req.Notes,
	})
	if errors.Is(err, repository.ErrPartnerNotFound) {
		response.Error(w, http.StatusNotFound, "partner tidak ditemukan")
		return
	}
	if err != nil {
		h.logger.Error("admin update partner", "err", err, "partner", id)
		response.Error(w, http.StatusInternalServerError, "gagal menyimpan")
		return
	}
	h.audit(r, "partner.updated", "Partner "+p.Code+" diubah",
		map[string]any{"partner_id": p.ID.String(), "code": p.Code,
			"commission_bps": p.CommissionBps, "status": p.Status})
	response.JSON(w, http.StatusOK, partnerDTOFlat(p))
}

// DELETE /api/v1/admin/partners/{id}
//
// Only for a partner that never brought anyone in — a typo'd code, a
// duplicate, a test row. Once there are referrals the row is a record of
// money owed, so the answer is "akhiri kerja sama" (status 'ended'), which
// keeps the history and stops new attribution.
func (h *AdminPartnersHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "id tidak valid")
		return
	}
	// Read first, so the audit entry can name what was removed and so a
	// missing partner is reported as missing rather than as "has history".
	p, err := h.partners.FindPartnerByID(r.Context(), id)
	if errors.Is(err, repository.ErrPartnerNotFound) {
		response.Error(w, http.StatusNotFound, "partner tidak ditemukan")
		return
	}
	if err != nil {
		h.logger.Error("admin delete partner lookup", "err", err, "partner", id)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	if err := h.partners.DeletePartner(r.Context(), id); err != nil {
		if errors.Is(err, repository.ErrPartnerHasHistory) {
			response.Error(w, http.StatusConflict,
				"partner ini sudah punya pendaftar, jadi tidak bisa dihapus. "+
					"Ubah statusnya jadi Selesai lewat Edit.")
			return
		}
		h.logger.Error("admin delete partner", "err", err, "partner", id)
		response.Error(w, http.StatusInternalServerError, "gagal menghapus partner")
		return
	}
	h.audit(r, "partner.deleted", "Partner "+p.Code+" dihapus",
		map[string]any{"partner_id": id.String(), "code": p.Code, "name": p.Name})
	response.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

// GET /api/v1/admin/partners/{id}
func (h *AdminPartnersHandler) Detail(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "id tidak valid")
		return
	}
	p, err := h.partners.FindPartnerByID(r.Context(), id)
	if errors.Is(err, repository.ErrPartnerNotFound) {
		response.Error(w, http.StatusNotFound, "partner tidak ditemukan")
		return
	}
	if err != nil {
		h.logger.Error("admin partner detail", "err", err, "partner", id)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	limit, offset := pageParams(r)
	users, userTotal, err := h.partners.ListReferredUsers(r.Context(), id, limit, offset)
	if err != nil {
		h.logger.Error("admin partner referrals", "err", err, "partner", id)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	commissions, commTotal, err := h.partners.ListCommissions(r.Context(), id, limit, offset)
	if err != nil {
		h.logger.Error("admin partner commissions", "err", err, "partner", id)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	payouts, err := h.partners.ListPayouts(r.Context(), id)
	if err != nil {
		h.logger.Error("admin partner payouts", "err", err, "partner", id)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	referredOut := make([]map[string]any, 0, len(users))
	for _, u := range users {
		referredOut = append(referredOut, map[string]any{
			"user_id": u.UserID, "name": u.Name, "email": u.Email,
			"signup_method": u.SignupMethod, "created_at": u.CreatedAt,
			"store_name": u.StoreName, "subscribed": u.Subscribed,
			"plan": u.Plan, "commission_cents": u.CommissionCents,
			"paid_at": u.PaidAt,
		})
	}
	commOut := make([]map[string]any, 0, len(commissions))
	for _, c := range commissions {
		commOut = append(commOut, map[string]any{
			"id": c.ID, "referred_user_email": c.ReferredUserEmail,
			"store_name": c.StoreName, "invoice_id": c.InvoiceID,
			"plan": c.Plan, "months": c.Months,
			"base_amount_cents": c.BaseAmountCents,
			"commission_bps":    c.CommissionBps,
			"commission_cents":  c.CommissionCents,
			"status":            c.Status, "void_reason": c.VoidReason,
			"payout_ref": c.PayoutRef, "paid_out_at": c.PaidOutAt,
			"created_at": c.CreatedAt,
		})
	}
	payoutOut := make([]map[string]any, 0, len(payouts))
	for _, p := range payouts {
		payoutOut = append(payoutOut, map[string]any{
			"id": p.ID, "amount_cents": p.AmountCents,
			"commission_count": p.CommissionCount, "method": p.Method,
			"reference": p.Reference, "notes": p.Notes, "paid_at": p.PaidAt,
		})
	}

	response.JSON(w, http.StatusOK, map[string]any{
		"partner":           partnerDTOFlat(p),
		"referrals":         referredOut,
		"referrals_total":   userTotal,
		"commissions":       commOut,
		"commissions_total": commTotal,
		"payouts":           payoutOut,
	})
}

type attachReferralReq struct {
	Email string `json:"email"`
}

// POST /api/v1/admin/partners/{id}/referrals
//
// The escape hatch: someone who already had an account before the event gets
// no automatic bond, but the operator may still owe the partner for them.
// Goes through the same unique index, so it can never take a user who already
// belongs to someone else.
func (h *AdminPartnersHandler) AttachReferral(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "id tidak valid")
		return
	}
	var req attachReferralReq
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "body tidak valid")
		return
	}
	email := strings.TrimSpace(req.Email)
	if email == "" {
		response.Error(w, http.StatusBadRequest, "email wajib diisi")
		return
	}
	if err := h.partners.AttachReferralByEmail(r.Context(), id, email); err != nil {
		if errors.Is(err, repository.ErrPartnerNotFound) {
			response.Error(w, http.StatusConflict,
				"user tidak ditemukan, atau sudah terhubung ke partner lain")
			return
		}
		h.logger.Error("admin attach referral", "err", err, "partner", id)
		response.Error(w, http.StatusInternalServerError, "gagal menghubungkan user")
		return
	}
	h.audit(r, "partner.referral_attached", "User "+email+" dihubungkan manual ke partner",
		map[string]any{"partner_id": id.String(), "email": email})
	response.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

type payoutReq struct {
	Method    string `json:"method"`
	Reference string `json:"reference"`
	Notes     string `json:"notes"`
}

// POST /api/v1/admin/partners/{id}/payouts
func (h *AdminPartnersHandler) RecordPayout(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "id tidak valid")
		return
	}
	var req payoutReq
	_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&req)

	actor, _ := adminActorID(r)
	p, err := h.partners.RecordPayout(r.Context(), repository.RecordPayoutInput{
		PartnerID: id,
		Method:    strings.TrimSpace(req.Method),
		Reference: strings.TrimSpace(req.Reference),
		Notes:     strings.TrimSpace(req.Notes),
		CreatedBy: actor,
	})
	if errors.Is(err, repository.ErrPayoutNothingDue) {
		// A second click, or someone else settled first. Nothing was owed,
		// so nothing is recorded — better than filing an empty receipt.
		response.Error(w, http.StatusConflict, "tidak ada komisi yang menunggu pembayaran")
		return
	}
	if errors.Is(err, repository.ErrPartnerNotFound) {
		response.Error(w, http.StatusNotFound, "partner tidak ditemukan")
		return
	}
	if err != nil {
		h.logger.Error("admin record payout", "err", err, "partner", id)
		response.Error(w, http.StatusInternalServerError, "gagal mencatat pembayaran")
		return
	}
	h.audit(r, "partner.payout_recorded",
		"Pembayaran komisi partner dicatat",
		map[string]any{
			"partner_id": id.String(), "payout_id": p.ID.String(),
			"amount_cents": p.AmountCents, "commission_count": p.CommissionCount,
			"reference": p.Reference,
		})
	response.JSON(w, http.StatusCreated, map[string]any{
		"id": p.ID, "amount_cents": p.AmountCents,
		"commission_count": p.CommissionCount, "paid_at": p.PaidAt,
	})
}

type voidReq struct {
	Reason string `json:"reason"`
}

// POST /api/v1/admin/partners/commissions/{id}/void
func (h *AdminPartnersHandler) VoidCommission(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "id tidak valid")
		return
	}
	var req voidReq
	_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&req)

	if err := h.partners.VoidCommission(r.Context(), id, req.Reason); err != nil {
		if errors.Is(err, repository.ErrCommissionLocked) {
			response.Error(w, http.StatusConflict,
				"komisi sudah dibayarkan atau sudah dibatalkan")
			return
		}
		h.logger.Error("admin void commission", "err", err, "commission", id)
		response.Error(w, http.StatusInternalServerError, "gagal membatalkan komisi")
		return
	}
	h.audit(r, "partner.commission_voided", "Komisi partner dibatalkan",
		map[string]any{"commission_id": id.String(), "reason": req.Reason})
	response.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

// === helpers ===

func partnerDTO(p *repository.PartnerWithStats) map[string]any {
	out := partnerDTOFlat(&p.Partner)
	out["referrals"] = p.Referrals
	out["converted"] = p.Converted
	out["owed_cents"] = p.OwedCents
	out["paid_cents"] = p.PaidCents
	out["gross_cents"] = p.GrossCents
	return out
}

func partnerDTOFlat(p *repository.Partner) map[string]any {
	return map[string]any{
		"id": p.ID, "code": p.Code, "name": p.Name,
		"contact_name": p.ContactName, "contact_email": p.ContactEmail,
		"contact_phone":  p.ContactPhone,
		"commission_bps": p.CommissionBps,
		"status":         p.Status, "notes": p.Notes,
		"created_at": p.CreatedAt, "updated_at": p.UpdatedAt,
	}
}

func pageParams(r *http.Request) (limit, offset int) {
	limit = 50
	if v, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && v > 0 && v <= 200 {
		limit = v
	}
	if v, err := strconv.Atoi(r.URL.Query().Get("offset")); err == nil && v > 0 {
		offset = v
	}
	return
}

func (h *AdminPartnersHandler) audit(r *http.Request, action, summary string, meta map[string]any) {
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
