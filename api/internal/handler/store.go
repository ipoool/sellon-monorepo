package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"regexp"
	"strings"

	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

type StoreHandler struct {
	stores *repository.StoreRepo
	logger *slog.Logger
}

func NewStoreHandler(stores *repository.StoreRepo, logger *slog.Logger) *StoreHandler {
	return &StoreHandler{stores: stores, logger: logger}
}

type storeDTO struct {
	ID             string `json:"id"`
	Slug           string `json:"slug"`
	Name           string `json:"name"`
	Description    string `json:"description"`
	LogoURL        string `json:"logo_url"`
	Category       string `json:"category"`
	City           string `json:"city"`
	WhatsAppNumber string `json:"whatsapp_number"`
	Instagram      string `json:"instagram"`
	TikTok         string `json:"tiktok"`
	IsOpen         bool   `json:"is_open"`
}

func toStoreDTO(s *repository.Store) storeDTO {
	return storeDTO{
		ID: s.ID.String(), Slug: s.Slug, Name: s.Name, Description: s.Description,
		LogoURL: s.LogoURL, Category: s.Category, City: s.City,
		WhatsAppNumber: s.WhatsAppNumber, Instagram: s.Instagram, TikTok: s.TikTok,
		IsOpen: s.IsOpen,
	}
}

// GET /api/v1/store
func (h *StoreHandler) Get(w http.ResponseWriter, r *http.Request) {
	uid, _ := auth.UserIDFromContext(r.Context())
	store, err := h.stores.FindByOwnerID(r.Context(), uid)
	if errors.Is(err, repository.ErrStoreNotFound) {
		response.JSON(w, http.StatusOK, map[string]any{"store": nil})
		return
	}
	if err != nil {
		h.logger.Error("get store", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"store": toStoreDTO(store)})
}

type createStoreReq struct {
	Name     string `json:"name"`
	Slug     string `json:"slug"`
	Category string `json:"category"`
	City     string `json:"city"`
}

// POST /api/v1/store — first-time setup
func (h *StoreHandler) Create(w http.ResponseWriter, r *http.Request) {
	uid, _ := auth.UserIDFromContext(r.Context())

	if existing, err := h.stores.FindByOwnerID(r.Context(), uid); err == nil && existing != nil {
		response.Error(w, http.StatusConflict, "store already exists")
		return
	}

	var req createStoreReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	req.Slug = sanitizeSlug(req.Slug)
	if req.Name == "" || req.Slug == "" {
		response.Error(w, http.StatusBadRequest, "nama dan slug wajib")
		return
	}

	store, err := h.stores.Create(r.Context(), repository.CreateStoreInput{
		OwnerID: uid, Slug: req.Slug, Name: req.Name,
		Category: req.Category, City: req.City,
	})
	if err != nil {
		h.logger.Error("create store", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal membuat toko (slug mungkin sudah dipakai)")
		return
	}
	response.JSON(w, http.StatusCreated, map[string]any{"store": toStoreDTO(store)})
}

type updateStoreReq struct {
	Name           string `json:"name"`
	Description    string `json:"description"`
	LogoURL        string `json:"logo_url"`
	Category       string `json:"category"`
	City           string `json:"city"`
	WhatsAppNumber string `json:"whatsapp_number"`
	Instagram      string `json:"instagram"`
	TikTok         string `json:"tiktok"`
	IsOpen         bool   `json:"is_open"`
}

// PUT /api/v1/store
func (h *StoreHandler) Update(w http.ResponseWriter, r *http.Request) {
	uid, _ := auth.UserIDFromContext(r.Context())
	existing, err := h.stores.FindByOwnerID(r.Context(), uid)
	if errors.Is(err, repository.ErrStoreNotFound) {
		response.Error(w, http.StatusNotFound, "toko belum dibuat")
		return
	}
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	var req updateStoreReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}

	store, err := h.stores.Update(r.Context(), existing.ID, repository.UpdateStoreInput{
		Name: strings.TrimSpace(req.Name), Description: req.Description, LogoURL: req.LogoURL,
		Category: req.Category, City: req.City,
		WhatsAppNumber: req.WhatsAppNumber, Instagram: req.Instagram, TikTok: req.TikTok,
		IsOpen: req.IsOpen,
	})
	if err != nil {
		h.logger.Error("update store", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal update toko")
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"store": toStoreDTO(store)})
}

var slugRe = regexp.MustCompile(`[^a-z0-9-]+`)

func sanitizeSlug(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = strings.ReplaceAll(s, " ", "-")
	s = slugRe.ReplaceAllString(s, "")
	s = strings.Trim(s, "-")
	if len(s) > 60 {
		s = s[:60]
	}
	return s
}
