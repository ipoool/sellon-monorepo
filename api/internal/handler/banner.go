package handler

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"path"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
	"github.com/sellon/sellon/api/internal/storage"
)

type BannerHandler struct {
	banners *repository.BannerRepo
	storage *storage.SupabaseClient
	logger  *slog.Logger
}

func NewBannerHandler(banners *repository.BannerRepo, storageCli *storage.SupabaseClient, logger *slog.Logger) *BannerHandler {
	return &BannerHandler{banners: banners, storage: storageCli, logger: logger}
}

func bannerDTO(b repository.Banner) map[string]any {
	return map[string]any{
		"id":         b.ID.String(),
		"image_url":  b.ImageURL,
		"title":      b.Title,
		"link_url":   b.LinkURL,
		"is_active":  b.IsActive,
		"sort_order": b.SortOrder,
		"created_at": b.CreatedAt.Format(time.RFC3339),
	}
}

func bannerList(rows []repository.Banner) []map[string]any {
	out := make([]map[string]any, 0, len(rows))
	for _, b := range rows {
		out = append(out, bannerDTO(b))
	}
	return out
}

// GET /api/v1/banners — active banners for the seller dashboard slider.
func (h *BannerHandler) ListActive(w http.ResponseWriter, r *http.Request) {
	rows, err := h.banners.ListActive(r.Context())
	if err != nil {
		h.logger.Error("banner list active", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"banners": bannerList(rows)})
}

// GET /api/v1/admin/banners — all banners (admin management view).
func (h *BannerHandler) ListAdmin(w http.ResponseWriter, r *http.Request) {
	rows, err := h.banners.ListAll(r.Context())
	if err != nil {
		h.logger.Error("banner list all", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"banners": bannerList(rows)})
}

// POST /api/v1/admin/banners — multipart: file (image) + optional title,
// link_url, sort_order. Uploads to platform/banners/ then inserts the row.
func (h *BannerHandler) Create(w http.ResponseWriter, r *http.Request) {
	if h.storage == nil || !h.storage.IsConfigured() {
		response.Error(w, http.StatusServiceUnavailable, "upload belum dikonfigurasi")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 16*1024*1024)
	if err := r.ParseMultipartForm(16 * 1024 * 1024); err != nil {
		response.Error(w, http.StatusBadRequest, "file terlalu besar (maks 15 MB)")
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		response.Error(w, http.StatusBadRequest, "file gambar wajib")
		return
	}
	defer file.Close()
	if header.Size > 15*1024*1024 {
		response.Error(w, http.StatusBadRequest, "ukuran maks 15 MB")
		return
	}

	contentType := header.Header.Get("Content-Type")
	switch contentType {
	case "image/jpeg", "image/png", "image/webp", "image/gif":
		// ok
	default:
		response.Error(w, http.StatusBadRequest, "format harus JPG/PNG/WebP/GIF")
		return
	}

	body, err := io.ReadAll(file)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "gagal baca file")
		return
	}

	ext := strings.ToLower(strings.TrimPrefix(path.Ext(header.Filename), "."))
	if ext == "" {
		switch contentType {
		case "image/png":
			ext = "png"
		case "image/webp":
			ext = "webp"
		case "image/gif":
			ext = "gif"
		default:
			ext = "jpg"
		}
	}

	// Platform-global path (no store prefix) — these aren't tenant-scoped.
	key, err := storage.RandomKey("platform/banners", ext)
	if err != nil {
		h.logger.Error("banner random key", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	res, err := h.storage.Upload(r.Context(), key, contentType, body)
	if err != nil {
		h.logger.Error("banner upload", "err", err)
		response.Error(w, http.StatusBadGateway, "gagal upload ke storage")
		return
	}

	sortOrder, _ := strconv.Atoi(strings.TrimSpace(r.FormValue("sort_order")))
	b, err := h.banners.Create(r.Context(), repository.BannerInput{
		ImageURL:  res.PublicURL,
		ImagePath: res.Path,
		Title:     strings.TrimSpace(r.FormValue("title")),
		LinkURL:   strings.TrimSpace(r.FormValue("link_url")),
		SortOrder: sortOrder,
	})
	if err != nil {
		h.logger.Error("banner create", "err", err)
		// Best-effort cleanup of the just-uploaded object so we don't orphan it.
		go func(p string) {
			_ = h.storage.DeleteObjects(context.Background(), []string{p})
		}(res.Path)
		response.Error(w, http.StatusInternalServerError, "gagal menyimpan banner")
		return
	}
	response.JSON(w, http.StatusCreated, bannerDTO(*b))
}

// PUT /api/v1/admin/banners/{id} — JSON metadata update (title, link, active,
// sort). Image is immutable; to change it, delete and re-upload.
func (h *BannerHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "id invalid")
		return
	}
	var req struct {
		Title     string `json:"title"`
		LinkURL   string `json:"link_url"`
		IsActive  bool   `json:"is_active"`
		SortOrder int    `json:"sort_order"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	err = h.banners.Update(r.Context(), id, repository.BannerUpdate{
		Title:     strings.TrimSpace(req.Title),
		LinkURL:   strings.TrimSpace(req.LinkURL),
		IsActive:  req.IsActive,
		SortOrder: req.SortOrder,
	})
	if errors.Is(err, repository.ErrBannerNotFound) {
		response.Error(w, http.StatusNotFound, "banner tidak ditemukan")
		return
	}
	if err != nil {
		h.logger.Error("banner update", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

// DELETE /api/v1/admin/banners/{id} — removes the row + its storage object.
func (h *BannerHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "id invalid")
		return
	}
	b, err := h.banners.Delete(r.Context(), id)
	if errors.Is(err, repository.ErrBannerNotFound) {
		response.Error(w, http.StatusNotFound, "banner tidak ditemukan")
		return
	}
	if err != nil {
		h.logger.Error("banner delete", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	// Fire-and-forget storage cleanup — never block the response on it.
	if h.storage != nil && b.ImagePath != "" {
		go func(p string) {
			_ = h.storage.DeleteObjects(context.Background(), []string{p})
		}(b.ImagePath)
	}
	response.JSON(w, http.StatusOK, map[string]any{"ok": true})
}
