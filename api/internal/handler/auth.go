package handler

import (
	"encoding/json"
	"html"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/email"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

type AuthHandler struct {
	users        *repository.UserRepo
	memberships  *repository.MembershipRepo
	google       *auth.GoogleVerifier
	jwt          *auth.JWTService
	mailer       *email.Mailer
	webOrigin    string
	logger       *slog.Logger
	cookieSecure bool
}

func NewAuthHandler(
	users *repository.UserRepo,
	memberships *repository.MembershipRepo,
	google *auth.GoogleVerifier,
	jwt *auth.JWTService,
	mailer *email.Mailer,
	webOrigin string,
	logger *slog.Logger,
	cookieSecure bool,
) *AuthHandler {
	return &AuthHandler{
		users:        users,
		memberships:  memberships,
		google:       google,
		jwt:          jwt,
		mailer:       mailer,
		webOrigin:    webOrigin,
		logger:       logger,
		cookieSecure: cookieSecure,
	}
}

type googleSignInReq struct {
	Credential string `json:"credential"`
}

type meResponse struct {
	ID                 string `json:"id"`
	Email              string `json:"email"`
	Name               string `json:"name"`
	PictureURL         string `json:"picture_url"`
	Role               string `json:"role"`
	// Store-level role (owner/admin/staff) — empty for platform admins with no store.
	StoreRole          string `json:"store_role,omitempty"`
	IsImpersonated     bool   `json:"is_impersonated,omitempty"`
	ImpersonatorID     string `json:"impersonator_id,omitempty"`
	ImpersonatorEmail  string `json:"impersonator_email,omitempty"`
}

// POST /api/v1/auth/google
func (h *AuthHandler) Google(w http.ResponseWriter, r *http.Request) {
	var req googleSignInReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Credential == "" {
		response.Error(w, http.StatusBadRequest, "missing credential")
		return
	}

	profile, err := h.google.Verify(r.Context(), req.Credential)
	if err != nil {
		h.logger.Warn("google id token verify failed", "err", err)
		response.Error(w, http.StatusUnauthorized, "invalid google credential")
		return
	}

	user, isNew, err := h.users.FindOrCreateByGoogleID(r.Context(), profile.Sub, profile.Email, profile.Name, profile.PictureURL)
	if err != nil {
		h.logger.Error("upsert user failed", "err", err)
		response.Error(w, http.StatusInternalServerError, "failed to create session")
		return
	}

	// Welcome email — kirim hanya saat user benar-benar baru di-insert
	// (isNew dari xmax-trick). Hindari spam ke user existing tiap login.
	// BCC ke halo@sellon.id supaya tim ops dapat copy registrasi.
	h.logger.Info("auth google", "user_id", user.ID, "email", user.Email, "is_new", isNew)
	if isNew {
		h.sendWelcomeEmail(user)
	}

	// Block banned users at the gate. Returns 403 (not 401) so the
	// frontend can distinguish "your account is suspended" from "your
	// credentials are bad".
	if user.IsBanned() {
		response.Error(w, http.StatusForbidden,
			"akun ini diblokir oleh admin. Hubungi support untuk informasi lebih lanjut.")
		return
	}

	// Auto-accept any pending staff invites that match this user's email.
	// Best-effort — login succeeds even if this fails.
	if h.memberships != nil {
		if accepted, err := h.memberships.AcceptInvitesForEmail(r.Context(), user.ID, user.Email); err != nil {
			h.logger.Warn("accept invites on login", "err", err, "user", user.ID.String())
		} else if accepted > 0 {
			h.logger.Info("invites auto-accepted", "user", user.ID.String(), "count", accepted)
		}
	}

	token, exp, err := h.jwt.Issue(user.ID)
	if err != nil {
		h.logger.Error("issue jwt failed", "err", err)
		response.Error(w, http.StatusInternalServerError, "failed to create session")
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     auth.SessionCookieName,
		Value:    token,
		Path:     "/",
		Expires:  exp,
		MaxAge:   int(time.Until(exp).Seconds()),
		HttpOnly: true,
		Secure:   h.cookieSecure,
		SameSite: http.SameSiteLaxMode,
	})

	response.JSON(w, http.StatusOK, meResponse{
		ID:         user.ID.String(),
		Email:      user.Email,
		Name:       user.Name,
		PictureURL: user.PictureURL,
		Role:       user.Role,
	})
}

// GET /api/v1/auth/me — protected route
func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	uid, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		response.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	user, err := h.users.FindByID(r.Context(), uid)
	if err != nil {
		response.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if user.IsBanned() {
		response.Error(w, http.StatusForbidden, "akun diblokir")
		return
	}
	// Resolve store-level role (owner/admin/staff).
	var storeRole string
	if _, role, err := h.memberships.GetUserStoreRole(r.Context(), user.ID); err == nil {
		storeRole = string(role)
	}

	out := meResponse{
		ID:         user.ID.String(),
		Email:      user.Email,
		Name:       user.Name,
		PictureURL: user.PictureURL,
		Role:       user.Role,
		StoreRole:  storeRole,
	}
	if impID, ok := auth.ImpersonatorIDFromContext(r.Context()); ok {
		out.IsImpersonated = true
		out.ImpersonatorID = impID.String()
		if imp, err := h.users.FindByID(r.Context(), impID); err == nil {
			out.ImpersonatorEmail = imp.Email
		}
	}
	response.JSON(w, http.StatusOK, out)
}

// sendWelcomeEmail kirim notifikasi "Selamat datang di SellOn" ke user
// yang baru pertama kali register. BCC otomatis ke halo@sellon.id agar
// tim ops dapat salinan tiap registrasi. No-op kalau mailer tidak
// di-configure (dev lokal tanpa Mailtrap key).
func (h *AuthHandler) sendWelcomeEmail(user *repository.User) {
	if h.mailer == nil || !h.mailer.Configured() {
		h.logger.Warn("welcome email skipped: mailer not configured",
			"user_id", user.ID, "email", user.Email)
		return
	}
	to := strings.TrimSpace(user.Email)
	if to == "" {
		h.logger.Warn("welcome email skipped: empty email",
			"user_id", user.ID)
		return
	}
	h.logger.Info("welcome email: dispatching", "user_id", user.ID, "email", to)
	greeting := "Halo " + user.Name + "!"
	if strings.TrimSpace(user.Name) == "" {
		greeting = "Halo!"
	}
	intro := "Terima kasih sudah daftar di SellOn — platform jualan WhatsApp untuk UMKM Indonesia. " +
		"Toko-mu sudah siap dibuat. Langkah berikutnya: lengkapi profil toko, " +
		"tambah produk pertama, dan share link toko-mu ke pembeli."

	dashURL := strings.TrimRight(h.webOrigin, "/") + "/dashboard"

	text := greeting + "\n\n" + intro +
		"\n\nMulai jualan: " + dashURL +
		"\n\nKalau ada pertanyaan, balas saja email ini — kami siap bantu.\n\n— Tim SellOn"

	body := `
<h1 style="margin:0 0 12px;font-size:18px;font-weight:600;color:#0f172a;">` + html.EscapeString(greeting) + `</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">` + html.EscapeString(intro) + `</p>
<p style="margin:0 0 8px;">
  <a href="` + html.EscapeString(dashURL) + `" style="display:inline-block;background:#10b981;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;">Mulai Jualan</a>
</p>
<p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#475569;">
  Kalau ada pertanyaan, balas saja email ini — kami siap bantu.
</p>
<p style="margin:8px 0 0;font-size:12px;color:#64748b;">Atau buka link berikut di browser:<br>
  <a href="` + html.EscapeString(dashURL) + `" style="color:#10b981;text-decoration:none;word-break:break-all;">` + html.EscapeString(dashURL) + `</a>
</p>`

	h.mailer.Send(email.Message{
		To:       to,
		ToName:   user.Name,
		Subject:  "Selamat datang di SellOn",
		Text:     text,
		HTML:     email.WrapHTML(body),
		Category: "welcome",
		BCC:      []string{"halo@sellon.id"},
	})
}

// POST /api/v1/auth/logout
func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     auth.SessionCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   h.cookieSecure,
		SameSite: http.SameSiteLaxMode,
	})
	response.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}
