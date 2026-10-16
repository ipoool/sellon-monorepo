package handler

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/payments"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

// BoothHandler serves the PhotoBoost tablets. Every route here is behind
// middleware.RequireBooth, so the caller is an authenticated device rather
// than a person, and the booth comes off the request context.
type BoothHandler struct {
	booths    *repository.PhotoBoothRepo
	sessions  *repository.PhotoBoothSessionRepo
	midtrans  *payments.MidtransClient
	serverKey string // the PLATFORM key: PhotoBoost is the platform's own business
	logger    *slog.Logger
}

func NewBoothHandler(
	booths *repository.PhotoBoothRepo,
	sessions *repository.PhotoBoothSessionRepo,
	midtrans *payments.MidtransClient,
	platformServerKey string,
	logger *slog.Logger,
) *BoothHandler {
	return &BoothHandler{
		booths: booths, sessions: sessions, midtrans: midtrans,
		serverKey: platformServerKey, logger: logger,
	}
}

// Reconcile throttles. A session that has just been charged gets a grace
// period before we start asking Midtrans about it, and then at most one
// question per interval however fast the booth polls.
const (
	reconcileAfterCharge = 20 * time.Second
	reconcileInterval    = 15 * time.Second
)

func (h *BoothHandler) booth(r *http.Request) *repository.AuthenticatedBooth {
	b, _ := auth.BoothFromContext(r.Context())
	return b
}

// GET /api/v1/booth/config
//
// The effective config — the booth's own overrides filled in from the platform
// defaults — plus a version the app can poll while idle to notice an admin
// change without re-downloading frames.
func (h *BoothHandler) Config(w http.ResponseWriter, r *http.Request) {
	b := h.booth(r)
	cfg, err := h.booths.EffectiveConfigFor(r.Context(), b.Booth.ID)
	if err != nil {
		h.logger.Error("booth config", "err", err, "booth", b.Booth.Code)
		response.Error(w, http.StatusInternalServerError, "gagal memuat konfigurasi")
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{
		"booth": map[string]any{
			"id":       b.Booth.ID,
			"code":     b.Booth.Code,
			"name":     b.Booth.Name,
			"location": b.Booth.Location,
			"status":   b.Booth.Status,
		},
		"config":         boothConfigDTO(cfg),
		"config_version": cfg.Version(),
		"server_time":    time.Now().Format(time.RFC3339),
	})
}

func boothConfigDTO(c *repository.EffectiveConfig) map[string]any {
	return map[string]any{
		"price_cents":             c.PriceCents,
		"shots_count":             c.ShotsCount,
		"print_copies":            c.PrintCopies,
		"session_timeout_seconds": c.SessionTimeoutSeconds,
		"qris_expiry_minutes":     c.QRISExpiryMinutes,
		"frames":                  c.Frames,
	}
}

type createBoothSessionReq struct {
	IdempotencyKey string `json:"idempotency_key"`
	FrameID        string `json:"frame_id"`
	AppVersion     string `json:"app_version"`
}

// POST /api/v1/booth/sessions
//
// Price and shot count are read from the server config and snapshotted onto
// the row. They are never accepted from the request: the tablet sits in a mall
// where anyone can reach it, so nothing it says about money is trusted.
func (h *BoothHandler) CreateSession(w http.ResponseWriter, r *http.Request) {
	b := h.booth(r)
	var req createBoothSessionReq
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&req); err != nil && !errors.Is(err, io.EOF) {
		response.Error(w, http.StatusBadRequest, "body tidak valid")
		return
	}

	cfg, err := h.booths.EffectiveConfigFor(r.Context(), b.Booth.ID)
	if err != nil {
		h.logger.Error("booth session config", "err", err, "booth", b.Booth.Code)
		response.Error(w, http.StatusInternalServerError, "gagal memuat konfigurasi")
		return
	}

	s, replayed, err := h.sessions.CreateSession(r.Context(), repository.CreateSessionInput{
		BoothID:        b.Booth.ID,
		BoothCode:      b.Booth.Code,
		DeviceTokenID:  b.TokenID,
		IdempotencyKey: strings.TrimSpace(req.IdempotencyKey),
		AmountCents:    cfg.PriceCents,
		ShotsPlanned:   cfg.ShotsCount,
		PrintCopies:    cfg.PrintCopies,
		FrameID:        strings.TrimSpace(req.FrameID),
		AppVersion:     strings.TrimSpace(req.AppVersion),
	})
	if err != nil {
		h.logger.Error("booth create session", "err", err, "booth", b.Booth.Code)
		response.Error(w, http.StatusInternalServerError, "gagal membuat sesi")
		return
	}

	// A replay answers 200 with the original session rather than 409: a booth
	// retrying through a flaky link needs to converge on one session, not
	// collect errors and certainly not start a second charge.
	status := http.StatusCreated
	if replayed {
		status = http.StatusOK
	}
	out := boothSessionDTO(s)
	out["replayed"] = replayed
	response.JSON(w, status, out)
}

// POST /api/v1/booth/sessions/{number}/charge
//
// Issues the dynamic QRIS. Idempotent by design: Midtrans rejects a second
// charge on an order_id it has seen, and by the time that rejection arrives
// the customer is already looking at a QR code.
func (h *BoothHandler) Charge(w http.ResponseWriter, r *http.Request) {
	b := h.booth(r)
	number := chi.URLParam(r, "number")

	if h.serverKey == "" {
		response.Error(w, http.StatusServiceUnavailable, "pembayaran belum dikonfigurasi")
		return
	}

	existing, err := h.sessions.FindByNumberForBooth(r.Context(), b.Booth.ID, number)
	if err != nil {
		response.Error(w, http.StatusNotFound, "sesi tidak ditemukan")
		return
	}
	// Already charged and the QR is still good — hand back what the customer
	// is looking at instead of asking Midtrans for a second code.
	if existing.QRString != "" || existing.QRURL != "" {
		if existing.QRExpiresAt == nil || existing.QRExpiresAt.After(time.Now()) {
			response.JSON(w, http.StatusOK, boothSessionDTO(existing))
			return
		}
	}

	claimed, err := h.sessions.ClaimForCharge(r.Context(), b.Booth.ID, number, number)
	if errors.Is(err, repository.ErrSessionNotChargeable) {
		response.Error(w, http.StatusConflict, "sesi tidak bisa ditagih lagi")
		return
	}
	if err != nil {
		h.logger.Error("booth claim charge", "err", err, "session", number)
		response.Error(w, http.StatusInternalServerError, "gagal menyiapkan pembayaran")
		return
	}

	cfg, err := h.booths.EffectiveConfigFor(r.Context(), b.Booth.ID)
	if err != nil {
		_ = h.sessions.ReleaseChargeClaim(r.Context(), claimed.ID)
		response.Error(w, http.StatusInternalServerError, "gagal memuat konfigurasi")
		return
	}

	charge, err := h.midtrans.ChargeQRIS(payments.QRISChargeInput{
		OrderID:       claimed.SessionNumber,
		GrossAmount:   claimed.AmountCents,
		ItemID:        "photoboost",
		ItemName:      "Sesi Foto (" + itoa(claimed.ShotsPlanned) + " foto)",
		ExpiryMinutes: cfg.QRISExpiryMinutes,
		ServerKey:     h.serverKey,
	})
	if err != nil {
		// Release so the booth can try again; a stranded claim would take the
		// unit out of service until someone noticed.
		_ = h.sessions.ReleaseChargeClaim(r.Context(), claimed.ID)
		h.logger.Error("booth qris charge", "err", err, "session", number)
		response.Error(w, http.StatusBadGateway, "gagal membuat kode QRIS, coba lagi")
		return
	}

	var expires *time.Time
	if t, ok := charge.ParsedExpiry(); ok {
		expires = &t
	} else {
		// Midtrans did not say; fall back to our own deadline rather than
		// leave the booth with no idea when to give up.
		t := time.Now().Add(time.Duration(cfg.QRISExpiryMinutes) * time.Minute)
		expires = &t
	}

	s, err := h.sessions.AttachQRIS(r.Context(), repository.AttachQRISInput{
		SessionID:     claimed.ID,
		TransactionID: charge.TransactionID,
		QRString:      charge.QRString,
		QRURL:         charge.QRCodeURL(),
		ExpiresAt:     expires,
	})
	if err != nil {
		// The charge exists at Midtrans but we failed to record it. Do NOT
		// release the claim: a second charge would be rejected anyway, and the
		// webhook can still settle by order_id.
		h.logger.Error("booth attach qris", "err", err, "session", number,
			"transaction_id", charge.TransactionID)
		response.Error(w, http.StatusInternalServerError, "gagal menyimpan kode QRIS")
		return
	}
	response.JSON(w, http.StatusOK, boothSessionDTO(s))
}

// GET /api/v1/booth/sessions/{number}
//
// The status poll, and the home of lazy reconciliation: if a webhook went
// missing, this is what notices. An unattended booth has nobody to spot a
// customer who paid and got nothing.
func (h *BoothHandler) GetSession(w http.ResponseWriter, r *http.Request) {
	b := h.booth(r)
	number := chi.URLParam(r, "number")

	s, err := h.sessions.FindByNumberForBooth(r.Context(), b.Booth.ID, number)
	if err != nil {
		response.Error(w, http.StatusNotFound, "sesi tidak ditemukan")
		return
	}

	if s2 := h.maybeReconcile(r.Context(), s); s2 != nil {
		s = s2
	}

	// Expire a stale unpaid session so the booth stops waiting and the row
	// stops looking live in the admin tab.
	if s.PaymentStatus == "pending" && s.QRExpiresAt != nil && s.QRExpiresAt.Before(time.Now()) {
		if err := h.sessions.MarkExpired(r.Context(), s.ID); err == nil {
			if fresh, err := h.sessions.FindByNumberForBooth(r.Context(), b.Booth.ID, number); err == nil {
				s = fresh
			}
		}
	}

	response.JSON(w, http.StatusOK, boothSessionDTO(s))
}

// maybeReconcile asks Midtrans what really happened, at most once per
// interval per session, and only for a session old enough that a webhook
// should already have arrived. Returns the refreshed row, or nil for no-op.
func (h *BoothHandler) maybeReconcile(ctx context.Context, s *repository.PhotoBoothSession) *repository.PhotoBoothSession {
	if s.PaymentStatus != "pending" || s.ChargedAt == nil || h.serverKey == "" {
		return nil
	}
	if time.Since(*s.ChargedAt) < reconcileAfterCharge {
		return nil
	}
	if s.ReconciledAt != nil && time.Since(*s.ReconciledAt) < reconcileInterval {
		return nil
	}
	// Stamp first: a Midtrans outage must not turn every poll into an
	// outbound call.
	_ = h.sessions.TouchReconciled(ctx, s.ID)

	st, err := h.midtrans.GetTransactionStatus(s.SessionNumber, h.serverKey)
	if err != nil {
		h.logger.Warn("booth reconcile", "err", err, "session", s.SessionNumber)
		return nil
	}
	mapped := payments.MapTransactionStatus(st.TransactionStatus, st.FraudStatus)
	if mapped != "paid" {
		return nil
	}
	if _, err := SettlePhotoBoothSession(ctx, h.sessions, h.logger, s, st.GrossAmount, st.TransactionID); err != nil {
		return nil
	}
	fresh, err := h.sessions.FindByProviderOrderID(ctx, s.SessionNumber)
	if err != nil {
		return nil
	}
	h.logger.Info("booth session settled by reconcile", "session", s.SessionNumber)
	return fresh
}

type boothShotsReq struct {
	ShotsTaken int `json:"shots_taken"`
}

// POST /api/v1/booth/sessions/{number}/shots
func (h *BoothHandler) Shots(w http.ResponseWriter, r *http.Request) {
	b := h.booth(r)
	number := chi.URLParam(r, "number")
	var req boothShotsReq
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "body tidak valid")
		return
	}
	if req.ShotsTaken < 0 {
		response.Error(w, http.StatusBadRequest, "jumlah foto tidak valid")
		return
	}
	s, err := h.sessions.SetShotsTaken(r.Context(), b.Booth.ID, number, req.ShotsTaken)
	if errors.Is(err, repository.ErrSessionNotPaid) {
		response.Error(w, http.StatusConflict, "sesi belum lunas")
		return
	}
	if err != nil {
		h.logger.Error("booth shots", "err", err, "session", number)
		response.Error(w, http.StatusInternalServerError, "gagal menyimpan progres")
		return
	}
	response.JSON(w, http.StatusOK, boothSessionDTO(s))
}

type boothCompleteReq struct {
	Outcome       string `json:"outcome"` // "completed" | "failed"
	FrameID       string `json:"frame_id"`
	PrintCopies   int    `json:"print_copies"`
	ResultURL     string `json:"result_url"`
	FailureReason string `json:"failure_reason"`
}

// POST /api/v1/booth/sessions/{number}/complete
//
// A failed print flags the session for review: the customer paid and walked
// away with nothing, so a human has to choose between a reprint and a refund.
func (h *BoothHandler) Complete(w http.ResponseWriter, r *http.Request) {
	b := h.booth(r)
	number := chi.URLParam(r, "number")
	var req boothCompleteReq
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "body tidak valid")
		return
	}
	switch req.Outcome {
	case "completed", "failed":
	default:
		response.Error(w, http.StatusBadRequest, "outcome harus completed atau failed")
		return
	}

	s, err := h.sessions.Complete(r.Context(), repository.CompleteSessionInput{
		BoothID:       b.Booth.ID,
		Number:        number,
		Succeeded:     req.Outcome == "completed",
		FrameID:       strings.TrimSpace(req.FrameID),
		PrintCopies:   req.PrintCopies,
		ResultURL:     strings.TrimSpace(req.ResultURL),
		FailureReason: truncate(strings.TrimSpace(req.FailureReason), 300),
	})
	if errors.Is(err, repository.ErrSessionNotPaid) {
		response.Error(w, http.StatusConflict, "sesi belum lunas")
		return
	}
	if err != nil {
		h.logger.Error("booth complete", "err", err, "session", number)
		response.Error(w, http.StatusInternalServerError, "gagal menutup sesi")
		return
	}
	if req.Outcome == "failed" {
		h.logger.Warn("booth print failed", "session", number, "booth", b.Booth.Code,
			"reason", req.FailureReason)
	}
	response.JSON(w, http.StatusOK, boothSessionDTO(s))
}

type boothHeartbeatReq struct {
	AppVersion string `json:"app_version"`
	PrinterOK  *bool  `json:"printer_ok"`
	PaperLow   *bool  `json:"paper_low"`
}

// POST /api/v1/booth/heartbeat
func (h *BoothHandler) Heartbeat(w http.ResponseWriter, r *http.Request) {
	b := h.booth(r)
	var req boothHeartbeatReq
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "body tidak valid")
		return
	}
	printerOK := true
	if req.PrinterOK != nil {
		printerOK = *req.PrinterOK
	}
	paperLow := false
	if req.PaperLow != nil {
		paperLow = *req.PaperLow
	}
	if err := h.booths.Heartbeat(r.Context(), b.Booth.ID,
		truncate(strings.TrimSpace(req.AppVersion), 40), printerOK, paperLow); err != nil {
		h.logger.Error("booth heartbeat", "err", err, "booth", b.Booth.Code)
		response.Error(w, http.StatusInternalServerError, "gagal mencatat heartbeat")
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

// boothSessionDTO is what a tablet sees. Deliberately narrow: no booth
// internals, no review reasons, nothing an operator-facing screen would want.
func boothSessionDTO(s *repository.PhotoBoothSession) map[string]any {
	out := map[string]any{
		"session_number": s.SessionNumber,
		"status":         s.Status,
		"payment_status": s.PaymentStatus,
		"amount_cents":   s.AmountCents,
		"shots_planned":  s.ShotsPlanned,
		"shots_taken":    s.ShotsTaken,
		"print_copies":   s.PrintCopies,
		"frame_id":       s.FrameID,
		"qr_string":      s.QRString,
		"qr_url":         s.QRURL,
		"created_at":     s.CreatedAt,
	}
	if s.QRExpiresAt != nil {
		out["qr_expires_at"] = s.QRExpiresAt
	}
	if s.PaidAt != nil {
		out["paid_at"] = s.PaidAt
	}
	return out
}

// truncate caps a free-text field a device supplies. Bodies are already
// size-capped; this bounds what reaches the database and the admin table.
func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max]
}
