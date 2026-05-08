package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/tokoflow/tokoflow/apps/api/internal/auth"
	"github.com/tokoflow/tokoflow/apps/api/internal/pkg/response"
	"github.com/tokoflow/tokoflow/apps/api/internal/repository"
)

type AuthHandler struct {
	users        *repository.UserRepo
	google       *auth.GoogleVerifier
	jwt          *auth.JWTService
	logger       *slog.Logger
	cookieSecure bool
}

func NewAuthHandler(users *repository.UserRepo, google *auth.GoogleVerifier, jwt *auth.JWTService, logger *slog.Logger, cookieSecure bool) *AuthHandler {
	return &AuthHandler{
		users:        users,
		google:       google,
		jwt:          jwt,
		logger:       logger,
		cookieSecure: cookieSecure,
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

	user, err := h.users.FindOrCreateByGoogleID(r.Context(), profile.Sub, profile.Email, profile.Name, profile.PictureURL)
	if err != nil {
		h.logger.Error("upsert user failed", "err", err)
		response.Error(w, http.StatusInternalServerError, "failed to create session")
		return
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
	response.JSON(w, http.StatusOK, meResponse{
		ID:         user.ID.String(),
		Email:      user.Email,
		Name:       user.Name,
		PictureURL: user.PictureURL,
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
