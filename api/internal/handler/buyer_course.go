package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/email"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

// BuyerCourseHandler powers the OTP-gated course viewer reached from the emailed
// /{slug}/course/{token} link. Public request/verify OTP endpoints issue a
// short-lived buyer_session cookie; the content endpoint sits behind
// RequireBuyer and records each open into download_logs (so course access shows
// up on the seller's Unduhan Digital page).
type BuyerCourseHandler struct {
	tokens       *repository.DownloadTokenRepo
	otps         *repository.BuyerOTPRepo
	courseVideos *repository.CourseVideoRepo
	logs         *repository.DownloadLogRepo
	mailer       *email.Mailer
	jwt          *auth.JWTService
	cookieSecure bool
	logger       *slog.Logger
}

func NewBuyerCourseHandler(
	tokens *repository.DownloadTokenRepo,
	otps *repository.BuyerOTPRepo,
	courseVideos *repository.CourseVideoRepo,
	logs *repository.DownloadLogRepo,
	mailer *email.Mailer,
	jwtSvc *auth.JWTService,
	cookieSecure bool,
	logger *slog.Logger,
) *BuyerCourseHandler {
	return &BuyerCourseHandler{
		tokens: tokens, otps: otps, courseVideos: courseVideos, logs: logs,
		mailer: mailer, jwt: jwtSvc, cookieSecure: cookieSecure, logger: logger,
	}
}

// resolveToken loads + validates a download token for ANY buyer-OTP flow (course
// or digital). Returns a generic 404 (written to w) on any miss so token
// existence isn't leaked. When the route carries a {slug} (course link) it must
// match the token's store; the digital /download/{token} route has no slug, so
// the token alone is the key. Rejects revoked (403) / expired (410) links.
func (h *BuyerCourseHandler) resolveToken(w http.ResponseWriter, r *http.Request) (*repository.DownloadInfo, bool) {
	token := chi.URLParam(r, "token")
	if token == "" || len(token) < 20 {
		response.Error(w, http.StatusNotFound, "link tidak valid")
		return nil, false
	}
	info, err := h.tokens.FindForDelivery(r.Context(), token)
	if errors.Is(err, repository.ErrDownloadTokenNotFound) {
		response.Error(w, http.StatusNotFound, "link tidak valid")
		return nil, false
	}
	if err != nil {
		h.logger.Error("buyer token lookup", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return nil, false
	}
	if slug := chi.URLParam(r, "slug"); slug != "" && !strings.EqualFold(info.StoreSlug, slug) {
		response.Error(w, http.StatusNotFound, "link tidak valid")
		return nil, false
	}
	if info.Token.RevokedAt != nil {
		response.Error(w, http.StatusForbidden, "akses telah dinonaktifkan oleh penjual")
		return nil, false
	}
	if info.Token.ExpiresAt != nil && info.Token.ExpiresAt.Before(time.Now()) {
		response.Error(w, http.StatusGone, "link sudah kedaluwarsa")
		return nil, false
	}
	return info, true
}

type otpRequest struct {
	Email string `json:"email"`
	Code  string `json:"code"`
}

// POST /storefront/{slug}/course/{token}/request-otp  (public)
func (h *BuyerCourseHandler) RequestOTP(w http.ResponseWriter, r *http.Request) {
	info, ok := h.resolveToken(w, r)
	if !ok {
		return
	}
	var req otpRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	buyerEmail := strings.ToLower(strings.TrimSpace(req.Email))
	if buyerEmail == "" {
		response.Error(w, http.StatusBadRequest, "email wajib diisi")
		return
	}
	if strings.TrimSpace(info.CustomerEmail) == "" {
		response.Error(w, http.StatusBadRequest, "pesanan ini tidak punya email terdaftar — hubungi penjual")
		return
	}
	// The buyer must know the email used at checkout — this is the proof of
	// purchase ownership. The token URL is already a secret, so a clear
	// mismatch message is acceptable for usability.
	if !strings.EqualFold(buyerEmail, strings.TrimSpace(info.CustomerEmail)) {
		response.Error(w, http.StatusBadRequest, "email tidak sesuai dengan email pesanan")
		return
	}

	code, err := h.otps.RequestOTP(r.Context(), info.Token.StoreID, info.Token.ID, buyerEmail)
	if errors.Is(err, repository.ErrOTPCooldown) {
		response.Error(w, http.StatusTooManyRequests, repository.ErrOTPCooldown.Error())
		return
	}
	if errors.Is(err, repository.ErrOTPTooMany) {
		response.Error(w, http.StatusTooManyRequests, repository.ErrOTPTooMany.Error())
		return
	}
	if err != nil {
		h.logger.Error("course otp request", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	if h.mailer.Configured() {
		subject, text, htmlBody := email.RenderBuyerOTP(info.StoreName, code, repository.OTPExpiryMinutes())
		h.mailer.Send(email.Message{
			To: info.CustomerEmail, ToName: info.CustomerName,
			Subject: subject, Text: text, HTML: htmlBody, Category: "buyer_otp",
		})
	} else {
		// Dev convenience: no mailer configured → log the code so the flow is testable.
		h.logger.Info("course OTP (mailer not configured)", "code", code, "email", buyerEmail)
	}

	response.JSON(w, http.StatusOK, map[string]any{
		"ok":           true,
		"email_masked": maskEmail(info.CustomerEmail),
	})
}

// POST /storefront/{slug}/course/{token}/verify-otp  (public)
func (h *BuyerCourseHandler) VerifyOTP(w http.ResponseWriter, r *http.Request) {
	info, ok := h.resolveToken(w, r)
	if !ok {
		return
	}
	var req otpRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	buyerEmail := strings.ToLower(strings.TrimSpace(req.Email))
	code := strings.TrimSpace(req.Code)
	if buyerEmail == "" || code == "" {
		response.Error(w, http.StatusBadRequest, "email dan kode wajib diisi")
		return
	}
	if strings.TrimSpace(info.CustomerEmail) == "" {
		response.Error(w, http.StatusBadRequest, "pesanan ini tidak punya email terdaftar — hubungi penjual")
		return
	}
	if !strings.EqualFold(buyerEmail, strings.TrimSpace(info.CustomerEmail)) {
		response.Error(w, http.StatusBadRequest, "email tidak sesuai dengan email pesanan")
		return
	}

	err := h.otps.VerifyOTP(r.Context(), info.Token.ID, buyerEmail, code)
	if errors.Is(err, repository.ErrOTPLocked) {
		response.Error(w, http.StatusTooManyRequests, repository.ErrOTPLocked.Error())
		return
	}
	if errors.Is(err, repository.ErrOTPInvalid) {
		response.Error(w, http.StatusBadRequest, repository.ErrOTPInvalid.Error())
		return
	}
	if err != nil {
		h.logger.Error("course otp verify", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Mint a short-lived buyer session scoped to THIS course token.
	tok, exp, err := h.jwt.IssueBuyer(auth.BuyerClaims{
		StoreID:     info.Token.StoreID,
		TokenID:     info.Token.ID,
		OrderItemID: info.Token.OrderItemID,
		Email:       buyerEmail,
	}, 6*time.Hour)
	if err != nil {
		h.logger.Error("course issue buyer token", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     auth.BuyerCookieName,
		Value:    tok,
		Path:     "/",
		Expires:  exp,
		MaxAge:   int(time.Until(exp).Seconds()),
		HttpOnly: true,
		Secure:   h.cookieSecure,
		SameSite: http.SameSiteLaxMode,
	})

	// Record the access ONCE per successful OTP login (not on every content
	// fetch) so the Unduhan Digital audit reflects real sessions, not refreshes.
	// Best-effort, detached from the request.
	ip, ua := clientIP(r), clientUA(r)
	go func(in repository.DownloadInfo) {
		bgCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := h.logs.Create(bgCtx, repository.DownloadLog{
			TokenID:     in.Token.ID,
			StoreID:     in.Token.StoreID,
			OrderID:     in.Token.OrderID,
			OrderItemID: in.Token.OrderItemID,
			CustomerID:  in.CustomerID,
			IPAddress:   ip,
			UserAgent:   ua,
			Blocked:     false,
		}); err != nil {
			h.logger.Error("course: audit log", "err", err, "token", in.Token.ID)
		}
	}(*info)

	response.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

type courseVideoOut struct {
	Title         string `json:"title"`
	YouTubeID     string `json:"youtube_id"`
	DescriptionMD string `json:"description_md"`
}

// GET /storefront/{slug}/course/{token}/content  (RequireBuyer)
// Returns the course playlist. Access is logged once at OTP verify time (not
// here) so page refreshes don't spam the Unduhan Digital audit.
func (h *BuyerCourseHandler) Content(w http.ResponseWriter, r *http.Request) {
	info, ok := h.resolveToken(w, r)
	if !ok {
		return
	}
	claims, ok := auth.BuyerFromContext(r.Context())
	if !ok || claims.TokenID != info.Token.ID {
		// Session is for a different course link.
		response.Error(w, http.StatusForbidden, "sesi tidak cocok dengan kelas ini")
		return
	}

	var videos []repository.CourseVideo
	if info.ProductID != nil {
		videos, _ = h.courseVideos.ListByProduct(r.Context(), *info.ProductID)
	}
	out := make([]courseVideoOut, 0, len(videos))
	for _, v := range videos {
		out = append(out, courseVideoOut{
			Title:         v.Title,
			YouTubeID:     youtubeID(v.YouTubeURL),
			DescriptionMD: v.DescriptionMD,
		})
	}

	resp := map[string]any{
		"product_name": info.ProductName,
		"videos":       out,
	}
	// Surface the access validity ("masa aktif") so the viewer can show the buyer
	// when their access ends. Nil = seumur hidup (no expiry).
	if info.Token.ExpiresAt != nil {
		resp["expires_at"] = info.Token.ExpiresAt.Format(time.RFC3339)
	}
	response.JSON(w, http.StatusOK, resp)
}

// maskEmail turns "andi@gmail.com" into "an***@gmail.com" for safe display.
func maskEmail(e string) string {
	e = strings.TrimSpace(e)
	at := strings.LastIndex(e, "@")
	if at <= 0 {
		return "***"
	}
	local, domain := e[:at], e[at:]
	if len(local) <= 2 {
		return local[:1] + "***" + domain
	}
	return local[:2] + "***" + domain
}
