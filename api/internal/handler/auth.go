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

	"github.com/jackc/pgx/v5"
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
	// emailPasswordEnabled gates the whole email+password path — register,
	// verify, resend, forgot password AND login. Off means Google-only.
	emailPasswordEnabled bool
}

// errEmailPasswordDisabled is the copy shown when the app is running
// Google-only. It names the alternative rather than just refusing, and says
// the account is the same one so nobody thinks they have to start over.
const errEmailPasswordDisabled = "masuk & daftar lewat email sedang tidak tersedia. " +
	"Silakan lanjutkan dengan Google — kalau kamu pernah pakai email yang sama, akunmu tetap yang itu juga."

func (h *AuthHandler) emailFlowsOpen(w http.ResponseWriter) bool {
	if h.emailPasswordEnabled {
		return true
	}
	response.Error(w, http.StatusServiceUnavailable, errEmailPasswordDisabled)
	return false
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
	emailPasswordEnabled bool,
) *AuthHandler {
	return &AuthHandler{
		users:                users,
		verifications:        verifications,
		memberships:          memberships,
		google:               google,
		jwt:                  jwt,
		mailer:               mailer,
		webOrigin:            webOrigin,
		logger:               logger,
		cookieSecure:         cookieSecure,
		emailPasswordEnabled: emailPasswordEnabled,
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

// truncateRunes cuts on a rune boundary. Slicing bytes can split a multi-byte
// character, and Postgres rejects the resulting invalid UTF-8 outright.
func truncateRunes(s string, max int) string {
	rs := []rune(s)
	if len(rs) <= max {
		return s
	}
	return string(rs[:max])
}

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
//
// Creates (or reuses) the user row and emails a 6-digit code. The submitted
// password is NEVER written to users.password_hash here — it is parked on the
// verification row and only installed once the code proves the caller owns
// the mailbox (see migration 0097). Without that, anyone could claim a
// pre-existing account, including legacy Google-only rows and the seeded
// platform admin, by POSTing an email + a password of their choosing.
// No session cookie is issued until VerifyEmail.
func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	if !h.emailFlowsOpen(w) {
		return
	}
	var req registerReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "data tidak valid")
		return
	}
	emailAddr := normalizeEmail(req.Email)
	name := truncateRunes(strings.TrimSpace(req.Name), maxNameLen)
	if !validEmail(emailAddr) {
		response.Error(w, http.StatusBadRequest, "email tidak valid")
		return
	}
	if !validPassword(req.Password) {
		response.Error(w, http.StatusBadRequest, "password minimal 8 karakter, kombinasi huruf & angka")
		return
	}

	// Look the account up BEFORE hashing so a flood of registrations for
	// existing emails can't pin the CPU in bcrypt.
	existing, err := h.users.FindByEmail(r.Context(), emailAddr)
	var user *repository.User
	switch {
	case err == nil && existing.HasPassword() && existing.IsEmailVerified():
		// A real, proven account. Point at login (and password reset).
		response.Error(w, http.StatusConflict, "email sudah terdaftar, silakan masuk")
		return
	case err == nil:
		// Legacy Google-only row, or an unverified/unclaimed registration.
		// Claiming it still requires the code.
		user = existing
	case errors.Is(err, repository.ErrUserNotFound):
		// Row is created without a password: an unverified row is not an
		// account yet, so a squatter can't lock the real owner out — the
		// owner re-registers, gets the code, and their password wins.
		user, err = h.users.CreateWithPassword(r.Context(), emailAddr, name, "")
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

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		h.logger.Error("hash password failed", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal memproses pendaftaran")
		return
	}

	h.dispatchCode(user, repository.PurposeVerifyEmail, &repository.PendingClaim{
		PasswordHash: string(hash),
		Name:         name,
	})
	response.JSON(w, http.StatusOK, map[string]any{
		"status": "verify_email",
		"email":  user.Email,
	})
}

type loginReq struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// dummyHash is compared against when the email is unknown or has no password,
// so a failed login costs the same bcrypt work as a real one and the response
// timing doesn't reveal which emails are registered.
var dummyHash = []byte("$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy")

// POST /api/v1/auth/login
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	if !h.emailFlowsOpen(w) {
		return
	}
	var req loginReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "data tidak valid")
		return
	}
	emailAddr := normalizeEmail(req.Email)

	user, err := h.users.FindByEmail(r.Context(), emailAddr)
	if err != nil {
		// Same work + same message as a real miss — no user enumeration.
		_ = bcrypt.CompareHashAndPassword(dummyHash, []byte(req.Password))
		response.Error(w, http.StatusUnauthorized, "email atau password salah")
		return
	}
	if !user.HasPassword() {
		// Either a legacy Google-only row, or a registration whose code was
		// never entered — in the latter case the password is parked on the
		// verification row, so check it there and send the user back to the
		// code step instead of telling them their password is wrong.
		claim, hasClaim, cErr := h.verifications.PendingClaim(r.Context(), user.ID, repository.PurposeVerifyEmail)
		if cErr != nil {
			h.logger.Error("lookup pending claim", "err", cErr, "user_id", user.ID)
		}
		if hasClaim && bcrypt.CompareHashAndPassword([]byte(claim.PasswordHash), []byte(req.Password)) == nil {
			if user.IsBanned() {
				response.Error(w, http.StatusForbidden, "akun ini diblokir oleh admin. Hubungi support untuk informasi lebih lanjut.")
				return
			}
			sent := h.dispatchCode(user, repository.PurposeVerifyEmail, nil)
			msg := "email belum diverifikasi. Kami kirim ulang kode verifikasi."
			if !sent {
				msg = "email belum diverifikasi. Kode sebelumnya masih berlaku — cek email kamu."
			}
			response.JSON(w, http.StatusForbidden, map[string]any{
				"error":  msg,
				"status": "verify_email",
				"email":  user.Email,
			})
			return
		}
		if !hasClaim {
			_ = bcrypt.CompareHashAndPassword(dummyHash, []byte(req.Password))
		}
		response.Error(w, http.StatusUnauthorized, "email atau password salah")
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
		sent := h.dispatchCode(user, repository.PurposeVerifyEmail, nil)
		msg := "email belum diverifikasi. Kami kirim ulang kode verifikasi."
		if !sent {
			msg = "email belum diverifikasi. Kode sebelumnya masih berlaku — cek email kamu."
		}
		response.JSON(w, http.StatusForbidden, map[string]any{
			"error":  msg,
			"status": "verify_email",
			"email":  user.Email,
		})
		return
	}

	h.completeLogin(w, r, user, false)
}

type verifyEmailReq struct {
	Email    string `json:"email"`
	Code     string `json:"code"`
	Password string `json:"password"`
}

var errClaimPasswordMismatch = errors.New("password tidak cocok dengan yang kamu pakai saat mendaftar")

// POST /api/v1/auth/verify-email
//
// Requires the password as well as the code. The code alone must not be
// enough: otherwise a stray code delivered to a mailbox whose owner never
// registered could be entered by that owner and would install the password a
// third party chose at register time.
func (h *AuthHandler) VerifyEmail(w http.ResponseWriter, r *http.Request) {
	if !h.emailFlowsOpen(w) {
		return
	}
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
	if user.IsBanned() {
		response.Error(w, http.StatusForbidden, "akun ini diblokir oleh admin. Hubungi support untuk informasi lebih lanjut.")
		return
	}

	err = h.verifications.Consume(r.Context(), user.ID, repository.PurposeVerifyEmail,
		strings.TrimSpace(req.Code),
		func(ctx context.Context, tx pgx.Tx, claim repository.PendingClaim) error {
			expected := claim.PasswordHash
			if expected == "" {
				expected = user.PasswordHash
			}
			if expected == "" {
				return errClaimPasswordMismatch
			}
			if bcrypt.CompareHashAndPassword([]byte(expected), []byte(req.Password)) != nil {
				return errClaimPasswordMismatch
			}
			return h.users.FinalizeVerificationTx(ctx, tx, user.ID, claim.PasswordHash, claim.Name)
		})
	if err != nil {
		switch {
		case errors.Is(err, errClaimPasswordMismatch):
			response.Error(w, http.StatusUnauthorized, errClaimPasswordMismatch.Error())
		case errors.Is(err, repository.ErrVerificationLocked):
			response.Error(w, http.StatusTooManyRequests, err.Error())
		case errors.Is(err, repository.ErrVerificationInvalid):
			response.Error(w, http.StatusBadRequest, err.Error())
		default:
			h.logger.Error("verify email failed", "err", err)
			response.Error(w, http.StatusInternalServerError, "gagal verifikasi email")
		}
		return
	}

	// Re-read so the session + response carry the freshly applied name.
	if fresh, ferr := h.users.FindByID(r.Context(), user.ID); ferr == nil {
		user = fresh
	}
	h.completeLogin(w, r, user, true)
}

type resendVerificationReq struct {
	Email string `json:"email"`
}

// POST /api/v1/auth/resend-verification
func (h *AuthHandler) ResendVerification(w http.ResponseWriter, r *http.Request) {
	if !h.emailFlowsOpen(w) {
		return
	}
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
	// pending=nil preserves the password parked by Register.
	code, err := h.verifications.RequestCode(r.Context(), user.ID, repository.PurposeVerifyEmail, nil)
	if err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, repository.ErrVerificationTooMany) || errors.Is(err, repository.ErrVerificationCooldown) {
			status = http.StatusTooManyRequests
		}
		response.Error(w, status, err.Error())
		return
	}
	h.sendVerificationEmail(user, code)
	response.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

type forgotPasswordReq struct {
	Email string `json:"email"`
}

// POST /api/v1/auth/forgot-password
// Always 200 — the response must not reveal whether the email is registered.
func (h *AuthHandler) ForgotPassword(w http.ResponseWriter, r *http.Request) {
	if !h.emailFlowsOpen(w) {
		return
	}
	var req forgotPasswordReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "data tidak valid")
		return
	}
	ok := map[string]bool{"ok": true}
	user, err := h.users.FindByEmail(r.Context(), normalizeEmail(req.Email))
	if err != nil || user.IsBanned() {
		response.JSON(w, http.StatusOK, ok)
		return
	}
	code, err := h.verifications.RequestCode(r.Context(), user.ID, repository.PurposeResetPassword, nil)
	if err != nil {
		// Cooldown/quota: stay silent, the earlier code is still valid.
		h.logger.Warn("reset code request skipped", "err", err, "user_id", user.ID)
		response.JSON(w, http.StatusOK, ok)
		return
	}
	h.sendResetEmail(user, code)
	response.JSON(w, http.StatusOK, ok)
}

type resetPasswordReq struct {
	Email    string `json:"email"`
	Code     string `json:"code"`
	Password string `json:"password"`
}

// POST /api/v1/auth/reset-password
// The code is the proof of ownership here, so it sets the password outright
// and revokes every session issued before now.
func (h *AuthHandler) ResetPassword(w http.ResponseWriter, r *http.Request) {
	if !h.emailFlowsOpen(w) {
		return
	}
	var req resetPasswordReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "data tidak valid")
		return
	}
	if !validPassword(req.Password) {
		response.Error(w, http.StatusBadRequest, "password minimal 8 karakter, kombinasi huruf & angka")
		return
	}
	user, err := h.users.FindByEmail(r.Context(), normalizeEmail(req.Email))
	if err != nil {
		response.Error(w, http.StatusBadRequest, repository.ErrVerificationInvalid.Error())
		return
	}
	if user.IsBanned() {
		response.Error(w, http.StatusForbidden, "akun ini diblokir oleh admin. Hubungi support untuk informasi lebih lanjut.")
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		h.logger.Error("hash password failed", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal mengatur ulang password")
		return
	}
	err = h.verifications.Consume(r.Context(), user.ID, repository.PurposeResetPassword,
		strings.TrimSpace(req.Code),
		func(ctx context.Context, tx pgx.Tx, _ repository.PendingClaim) error {
			return h.users.ResetPasswordTx(ctx, tx, user.ID, string(hash))
		})
	if err != nil {
		switch {
		case errors.Is(err, repository.ErrVerificationLocked):
			response.Error(w, http.StatusTooManyRequests, err.Error())
		case errors.Is(err, repository.ErrVerificationInvalid):
			response.Error(w, http.StatusBadRequest, err.Error())
		default:
			h.logger.Error("reset password failed", "err", err)
			response.Error(w, http.StatusInternalServerError, "gagal mengatur ulang password")
		}
		return
	}
	if fresh, ferr := h.users.FindByID(r.Context(), user.ID); ferr == nil {
		user = fresh
	}
	h.completeLogin(w, r, user, false)
}

// dispatchCode requests a fresh code and emails it, swallowing rate-limit
// errors (the earlier code is still valid) so register/login never fail on
// this. Reports whether an email actually went out so callers can word the
// response honestly instead of always claiming "kode terkirim".
func (h *AuthHandler) dispatchCode(user *repository.User, purpose repository.VerificationPurpose, pending *repository.PendingClaim) bool {
	code, err := h.verifications.RequestCode(context.Background(), user.ID, purpose, pending)
	if err != nil {
		h.logger.Warn("verification code request skipped", "err", err, "user_id", user.ID)
		return false
	}
	if purpose == repository.PurposeResetPassword {
		h.sendResetEmail(user, code)
	} else {
		h.sendVerificationEmail(user, code)
	}
	return true
}

func (h *AuthHandler) sendResetEmail(user *repository.User, code string) {
	if h.mailer == nil || !h.mailer.Configured() {
		h.logger.Warn("reset email skipped: mailer not configured", "user_id", user.ID)
		return
	}
	subject, text, htmlBody := email.RenderPasswordReset(user.Name, code, repository.EmailVerifyExpiryMinutes)
	h.mailer.Send(email.Message{
		To:       user.Email,
		ToName:   user.Name,
		Subject:  subject,
		Text:     text,
		HTML:     htmlBody,
		Category: "password-reset",
	})
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
