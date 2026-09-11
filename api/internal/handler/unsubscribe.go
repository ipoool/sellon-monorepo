package handler

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"log/slog"
	"net/http"

	"github.com/google/uuid"

	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

// UnsubscribeHandler serves the opt-out link carried by every
// non-transactional email.
//
// It is intentionally public and session-free: the recipient clicking it is
// usually not logged in, and a mail client acting on List-Unsubscribe has no
// session at all. Authorisation comes from an HMAC over the user id keyed by
// the app secret, so a link cannot be forged or guessed, and enumerating
// user ids gets you nothing without the matching signature.
type UnsubscribeHandler struct {
	users  *repository.UserRepo
	secret []byte
	logger *slog.Logger
}

func NewUnsubscribeHandler(users *repository.UserRepo, secret string, logger *slog.Logger) *UnsubscribeHandler {
	return &UnsubscribeHandler{users: users, secret: []byte(secret), logger: logger}
}

// Token returns the opt-out signature for a user. Deterministic, so a link
// stays valid across restarts and needs no extra column.
func UnsubscribeToken(secret string, userID uuid.UUID) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte("unsubscribe:" + userID.String()))
	return hex.EncodeToString(mac.Sum(nil))[:32]
}

// URL is the link embedded in an email body and in the List-Unsubscribe
// header.
func UnsubscribeURL(base, secret string, userID uuid.UUID) string {
	return base + "/api/v1/unsubscribe?u=" + userID.String() +
		"&t=" + UnsubscribeToken(secret, userID)
}

// Unsubscribe handles both the clicked link (GET) and a mail client's
// one-click request (POST, per RFC 8058). Both are idempotent.
func (h *UnsubscribeHandler) Unsubscribe(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.URL.Query().Get("u"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "link berhenti berlangganan tidak valid")
		return
	}
	want := UnsubscribeToken(string(h.secret), id)
	if subtle.ConstantTimeCompare([]byte(want), []byte(r.URL.Query().Get("t"))) != 1 {
		response.Error(w, http.StatusBadRequest, "link berhenti berlangganan tidak valid")
		return
	}
	if err := h.users.SetMarketingOptIn(r.Context(), id, false); err != nil {
		h.logger.Error("unsubscribe failed", "err", err, "user_id", id)
		response.Error(w, http.StatusInternalServerError, "gagal memproses, coba lagi")
		return
	}
	h.logger.Info("marketing unsubscribe", "user_id", id)

	// A mail client's one-click POST wants a bare 200, not a page.
	if r.Method == http.MethodPost {
		response.JSON(w, http.StatusOK, map[string]bool{"ok": true})
		return
	}
	// A human clicked the link: confirm in plain language, no login required.
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(unsubscribedPage))
}

const unsubscribedPage = `<!doctype html>
<html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Berhenti berlangganan — SellOn</title></head>
<body style="margin:0;background:#f1f5f9;font-family:system-ui,-apple-system,Segoe UI,sans-serif;">
<div style="max-width:480px;margin:64px auto;background:#fff;border-radius:12px;padding:32px;">
<h1 style="margin:0 0 12px;font-size:20px;color:#0f172a;">Kamu sudah berhenti berlangganan</h1>
<p style="margin:0 0 16px;color:#334155;line-height:1.6;">
Kami tidak akan mengirim email tips lagi ke alamat ini.</p>
<p style="margin:0;color:#475569;font-size:14px;line-height:1.6;">
Email soal pesanan, pembayaran, dan keamanan akun tetap dikirim, karena itu
bagian dari layanan yang kamu pakai.</p>
</div></body></html>`
