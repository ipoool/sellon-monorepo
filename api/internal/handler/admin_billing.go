package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"regexp"
	"strings"

	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

// AdminBillingHandler edits where sellers send their subscription payment.
//
// Four strings, and the most consequential ones in the product: manual
// bank transfer is the only way to pay for a subscription, so a wrong
// account number sends real money somewhere nobody can reconcile. They
// used to be constants in the web bundle; the point of this handler is
// that fixing them is an edit rather than a deploy.
type AdminBillingHandler struct {
	billing       *repository.BillingSettingsRepo
	platformAudit *repository.PlatformAuditRepo
	users         *repository.UserRepo
	logger        *slog.Logger
}

func NewAdminBillingHandler(
	billing *repository.BillingSettingsRepo,
	platformAudit *repository.PlatformAuditRepo,
	users *repository.UserRepo,
	logger *slog.Logger,
) *AdminBillingHandler {
	return &AdminBillingHandler{
		billing: billing, platformAudit: platformAudit, users: users, logger: logger,
	}
}

type billingSettingsDTO struct {
	BankName        string `json:"bank_name"`
	AccountNumber   string `json:"account_number"`
	AccountName     string `json:"account_name"`
	SupportWhatsApp string `json:"support_whatsapp"`
	Note            string `json:"note"`
}

func toBillingDTO(s repository.BillingSettings) billingSettingsDTO {
	return billingSettingsDTO{
		BankName:        s.BankName,
		AccountNumber:   s.AccountNumber,
		AccountName:     s.AccountName,
		SupportWhatsApp: s.SupportWhatsApp,
		Note:            s.Note,
	}
}

// GET /api/v1/admin/billing-settings
func (h *AdminBillingHandler) Get(w http.ResponseWriter, r *http.Request) {
	s, err := h.billing.Get(r.Context())
	if err != nil {
		h.logger.Error("admin billing settings get", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"billing": toBillingDTO(s)})
}

// waDigits strips everything a human might type around a phone number —
// +, spaces, dashes, brackets — and normalises a local 08… to 628…, so
// the stored value is always something wa.me will accept.
var nonDigits = regexp.MustCompile(`[^0-9]`)

func normaliseWhatsApp(raw string) string {
	d := nonDigits.ReplaceAllString(raw, "")
	switch {
	case strings.HasPrefix(d, "0"):
		return "62" + strings.TrimPrefix(d, "0")
	case strings.HasPrefix(d, "620"):
		return "62" + strings.TrimPrefix(d, "620")
	default:
		return d
	}
}

// PUT /api/v1/admin/billing-settings
func (h *AdminBillingHandler) Update(w http.ResponseWriter, r *http.Request) {
	var req billingSettingsDTO
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "body tidak valid")
		return
	}
	req.BankName = strings.TrimSpace(req.BankName)
	req.AccountNumber = strings.TrimSpace(req.AccountNumber)
	req.AccountName = strings.TrimSpace(req.AccountName)
	req.Note = strings.TrimSpace(req.Note)
	req.SupportWhatsApp = normaliseWhatsApp(req.SupportWhatsApp)

	// All three are required together: a bank with no number, or a number
	// with no holder name, is a transfer a seller cannot complete. Better
	// to refuse the save than to ship half an instruction to everyone.
	if req.BankName == "" || req.AccountNumber == "" || req.AccountName == "" {
		response.Error(w, http.StatusBadRequest,
			"nama bank, nomor rekening, dan nama pemilik wajib diisi")
		return
	}
	if nonDigits.MatchString(req.AccountNumber) {
		response.Error(w, http.StatusBadRequest, "nomor rekening hanya boleh angka")
		return
	}
	if len(req.AccountNumber) > 24 {
		response.Error(w, http.StatusBadRequest, "nomor rekening terlalu panjang")
		return
	}
	if req.SupportWhatsApp != "" &&
		(len(req.SupportWhatsApp) < 8 || len(req.SupportWhatsApp) > 20) {
		response.Error(w, http.StatusBadRequest, "nomor WhatsApp tidak valid")
		return
	}
	if len(req.BankName) > 60 || len(req.AccountName) > 120 || len(req.Note) > 400 {
		response.Error(w, http.StatusBadRequest, "isian terlalu panjang")
		return
	}

	// Read first so the audit entry carries the account number this
	// REPLACED. If payments start landing nowhere, the question asked
	// afterwards is "what did it used to say", and it must be answerable.
	before, err := h.billing.Get(r.Context())
	if err != nil {
		h.logger.Error("admin billing settings read-before", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	uid, _ := auth.UserIDFromContext(r.Context())
	after, err := h.billing.Update(r.Context(), repository.BillingSettings{
		BankName:        req.BankName,
		AccountNumber:   req.AccountNumber,
		AccountName:     req.AccountName,
		SupportWhatsApp: req.SupportWhatsApp,
		Note:            req.Note,
	}, uid)
	if err != nil {
		h.logger.Error("admin billing settings update", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal menyimpan")
		return
	}

	h.audit(r, "billing_settings.updated", "Update rekening pembayaran langganan",
		map[string]any{
			"before_bank":    before.BankName,
			"before_account": before.AccountNumber,
			"before_name":    before.AccountName,
			"before_wa":      before.SupportWhatsApp,
			"after_bank":     after.BankName,
			"after_account":  after.AccountNumber,
			"after_name":     after.AccountName,
			"after_wa":       after.SupportWhatsApp,
		})

	response.JSON(w, http.StatusOK, map[string]any{"billing": toBillingDTO(after)})
}

func (h *AdminBillingHandler) audit(r *http.Request, action, summary string, meta map[string]any) {
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
