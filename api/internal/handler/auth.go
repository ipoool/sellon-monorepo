package handler

import (
	"context"
	"encoding/json"
	"errors"
	"html"
	"log/slog"
	"net/http"
	"net/mail"
	"strings"
	"time"
	"unicode"

	"golang.org/x/crypto/bcrypt"

	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/email"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

type AuthHandler struct {
	users         *repository.UserRepo
	verifications *repository.EmailVerificationRepo
	memberships   *repository.MembershipRepo
	google        *auth.GoogleVerifier
	jwt           *auth.JWTService
	mailer        *email.Mailer
	webOrigin     string
	logger        *slog.Logger
	cookieSecure  bool
}

func NewAuthHandler(
	users *repository.UserRepo,
	verifications *repository.EmailVerificationRepo,
	memberships *repository.MembershipRepo,
	google *auth.GoogleVerifier,
	jwt *auth.JWTService,
	mailer *email.Mailer,
	webOrigin string,
	logger *slog.Logger,
	cookieSecure bool,
) *AuthHandler {
	return &AuthHandler{
		users:         users,
		verifications: verifications,
		memberships:   memberships,
		google:        google,
		jwt:           jwt,
		mailer:        mailer,
		webOrigin:     webOrigin,
		logger:        logger,
		cookieSecure:  cookieSecure,
	}
}

type googleSignInReq struct {
	Credential string `json:"credential"`
}

type meResponse struct {
	ID         string `json:"id"`
	Email      string `json:"email"`
	Name       string `json:"name"`
	PictureURL string `json:"picture_url"`
	Role       string `json:"role"`
	// Store-level role (owner/admin/staff) — empty for platform admins with no store.
	StoreRole         string `json:"store_role,omitempty"`
	IsImpersonated    bool   `json:"is_impersonated,omitempty"`
	ImpersonatorID    string `json:"impersonator_id,omitempty"`
	ImpersonatorEmail string `json:"impersonator_email,omitempty"`
}

func toMeResponse(user *repository.User) meResponse {
	return meResponse{
		ID:         user.ID.String(),
		Email:      user.Email,
		Name:       user.Name,
		PictureURL: user.PictureURL,
		Role:       user.Role,
	}
}

func (h *AuthHandler) setSessionCookie(w http.ResponseWriter, token string, exp time.Time) {
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
}

const (
	minPasswordLen = 8
	maxNameLen     = 120
)

func normalizeEmail(s string) string { return strings.ToLower(strings.TrimSpace(s)) }

func validEmail(s string) bool {
	if s == "" || len(s) > 254 {
		return false
	}
	_, err := mail.ParseAddress(s)
	return err == nil
}

// validPassword requires length >= 8 and at least one letter + one digit —
// enough friction to avoid trivial passwords without being annoying.
func validPassword(pw string) bool {
	if len(pw) < minPasswordLen || len(pw) > 72 { // bcrypt truncates at 72 bytes
		return false
	}
	var hasLetter, hasDigit bool
	for _, r := range pw {
		switch {
		case unicode.IsLetter(r):
			hasLetter = true
		case unicode.IsDigit(r):
			hasDigit = true
		}
	}
	return hasLetter && hasDigit
}

type registerReq struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Name     string `json:"name"`
}

// POST /api/v1/auth/register
// Creates the user row (or "claims" a legacy Google-only row that shares
// this email) with a password, then emails a 6-digit verification code.
// No session cookie is issued yet — that only happens after VerifyEmail.
func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req registerReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "data tidak valid")
		return
	}
	emailAddr := normalizeEmail(req.Email)
	name := strings.TrimSpace(req.Name)
	if len(name) > maxNameLen {
		name = name[:maxNameLen]
	}
	if !validEmail(emailAddr) {
		response.Error(w, http.StatusBadRequest, "email tidak valid")
		return
	}
	if !validPassword(req.Password) {
		response.Error(w, http.StatusBadRequest, "password minimal 8 karakter, kombinasi huruf & angka")
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		h.logger.Error("hash password failed", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal memproses pendaftaran")
		return
	}

	existing, err := h.users.FindByEmail(r.Context(), emailAddr)
	var user *repository.User
	switch {
	case err == nil && existing.HasPassword():
		// Already a real password account — don't leak which via a
		// different message, just point at login.
		response.Error(w, http.StatusConflict, "email sudah terdaftar, silakan masuk")
		return
	case err == nil:
		// Legacy Google-only row (or a previously abandoned unverified
		// registration) — claim it by attaching a password.
		if setErr := h.users.SetPassword(r.Context(), existing.ID, string(hash)); setErr != nil {
			h.logger.Error("claim legacy account failed", "err", setErr)
			response.Error(w, http.StatusInternalServerError, "gagal memproses pendaftaran")
			return
		}
		if name != "" {
			existing.Name = name
		}
		user = existing
	case errors.Is(err, repository.ErrUserNotFound):
		user, err = h.users.CreateWithPassword(r.Context(), emailAddr, name, string(hash))
		if err != nil {
			h.logger.Error("create user failed", "err", err)
			response.Error(w, http.StatusInternalServerError, "gagal memproses pendaftaran")
			return
		}
	default:
		h.logger.Error("lookup user by email failed", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal memproses pendaftaran")
		return
	}

	if user.IsBanned() {
		response.Error(w, http.StatusForbidden, "akun ini diblokir oleh admin. Hubungi support untuk informasi lebih lanjut.")
		return
	}

	// Google logins already proved email ownership — skip the OTP step and
	// let them straight in with their freshly-claimed password.
	if user.IsEmailVerified() {
		h.completeLogin(w, r, user, false)
		return
	}

	h.dispatchVerificationCode(user)
	response.JSON(w, http.StatusOK, map[string]any{
		"status": "verify_email",
		"email":  user.Email,
	})
}

type loginReq struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// POST /api/v1/auth/login
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req loginReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "data tidak valid")
		return
	}
	emailAddr := normalizeEmail(req.Email)

	user, err := h.users.FindByEmail(r.Context(), emailAddr)
	if err != nil {
		response.Error(w, http.StatusUnauthorized, "email atau password salah")
		return
	}
	if !user.HasPassword() {
		response.Error(w, http.StatusUnauthorized, "akun ini belum punya password. Daftar dengan email yang sama untuk mengaktifkannya.")
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)) != nil {
		response.Error(w, http.StatusUnauthorized, "email atau password salah")
		return
	}
	if user.IsBanned() {
		response.Error(w, http.StatusForbidden, "akun ini diblokir oleh admin. Hubungi support untuk informasi lebih lanjut.")
		return
	}
	if !user.IsEmailVerified() {
		h.dispatchVerificationCode(user)
		response.JSON(w, http.StatusForbidden, map[string]any{
			"error":  "email belum diverifikasi. Kami kirim ulang kode verifikasi.",
			"status": "verify_email",
			"email":  user.Email,
		})
		return
	}

	h.completeLogin(w, r, user, false)
}

type verifyEmailReq struct {
	Email string `json:"email"`
	Code  string `json:"code"`
}

// POST /api/v1/auth/verify-email
func (h *AuthHandler) VerifyEmail(w http.ResponseWriter, r *http.Request) {
	var req verifyEmailReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "data tidak valid")
		return
	}
	user, err := h.users.FindByEmail(r.Context(), normalizeEmail(req.Email))
	if err != nil {
		response.Error(w, http.StatusBadRequest, repository.ErrVerificationInvalid.Error())
		return
	}
	if err := h.verifications.VerifyCode(r.Context(), user.ID, strings.TrimSpace(req.Code)); err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, repository.ErrVerificationLocked) {
			status = http.StatusTooManyRequests
		}
		response.Error(w, status, err.Error())
		return
	}
	if err := h.users.MarkEmailVerified(r.Context(), user.ID); err != nil {
		h.logger.Error("mark email verified failed", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal verifikasi email")
		return
	}
	if user.IsBanned() {
		response.Error(w, http.StatusForbidden, "akun ini diblokir oleh admin. Hubungi support untuk informasi lebih lanjut.")
		return
	}
	h.completeLogin(w, r, user, true)
}

type resendVerificationReq struct {
	Email string `json:"email"`
}

// POST /api/v1/auth/resend-verification
func (h *AuthHandler) ResendVerification(w http.ResponseWriter, r *http.Request) {
	var req resendVerificationReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "data tidak valid")
		return
	}
	user, err := h.users.FindByEmail(r.Context(), normalizeEmail(req.Email))
	if err != nil {
		// Don't leak whether the email exists.
		response.JSON(w, http.StatusOK, map[string]bool{"ok": true})
		return
	}
	if user.IsEmailVerified() {
		response.JSON(w, http.StatusOK, map[string]bool{"ok": true})
		return
	}
	code, err := h.verifications.RequestCode(r.Context(), user.ID)
	if err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, repository.ErrVerificationTooMany) {
			status = http.StatusTooManyRequests
		}
		response.Error(w, status, err.Error())
		return
	}
	h.sendVerificationEmail(user, code)
	response.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// dispatchVerificationCode requests a fresh code and emails it, swallowing
// rate-limit errors (the user just gets no new email — the earlier one is
// still valid) so register/login flows never fail on this.
func (h *AuthHandler) dispatchVerificationCode(user *repository.User) {
	code, err := h.verifications.RequestCode(context.Background(), user.ID)
	if err != nil {
		h.logger.Warn("verification code request skipped", "err", err, "user_id", user.ID)
		return
	}
	h.sendVerificationEmail(user, code)
}

func (h *AuthHandler) sendVerificationEmail(user *repository.User, code string) {
	if h.mailer == nil || !h.mailer.Configured() {
		h.logger.Warn("verification email skipped: mailer not configured", "user_id", user.ID, "email", user.Email)
		return
	}
	subject, text, htmlBody := email.RenderEmailVerification(user.Name, code, repository.EmailVerifyExpiryMinutes)
	h.mailer.Send(email.Message{
		To:       user.Email,
		ToName:   user.Name,
		Subject:  subject,
		Text:     text,
		HTML:     htmlBody,
		Category: "email-verification",
	})
}

// completeLogin issues the session cookie + response shared by
// register-claim (already-verified legacy account), verify-email, and
// login. Fires the welcome email + invite auto-accept only when
// sendWelcome is true (first-ever verification).
func (h *AuthHandler) completeLogin(w http.ResponseWriter, r *http.Request, user *repository.User, sendWelcome bool) {
	if sendWelcome {
		h.sendWelcomeEmail(user)
	}
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
	h.setSessionCookie(w, token, exp)
	response.JSON(w, http.StatusOK, toMeResponse(user))
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
