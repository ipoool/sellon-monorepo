package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/sellon/sellon/api/internal/audit"
	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

type CategoryHandler struct {
	categories *repository.CategoryRepo
	stores     *repository.StoreRepo
	audit      *audit.Logger
	logger     *slog.Logger
}

func NewCategoryHandler(c *repository.CategoryRepo, s *repository.StoreRepo, audit *audit.Logger, logger *slog.Logger) *CategoryHandler {
	return &CategoryHandler{categories: c, stores: s, audit: audit, logger: logger}
}

type categoryDTO struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	SortOrder    int    `json:"sort_order"`
	ProductCount int    `json:"product_count"`
}

// GET /api/v1/categories
func (h *CategoryHandler) List(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if err != nil {
		response.JSON(w, http.StatusOK, map[string]any{"categories": []categoryDTO{}})
		return
	}
	rows, err := h.categories.ListByStore(r.Context(), store.ID)
	if err != nil {
		h.logger.Error("list categories", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	out := make([]categoryDTO, 0, len(rows))
	for _, c := range rows {
		out = append(out, categoryDTO{
			ID: c.ID.String(), Name: c.Name,
			SortOrder: c.SortOrder, ProductCount: c.ProductCount,
		})
	}
	response.JSON(w, http.StatusOK, map[string]any{"categories": out})
}

type categoryReq struct {
	Name string `json:"name"`
}

// POST /api/v1/categories
func (h *CategoryHandler) Create(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	var req categoryReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		response.Error(w, http.StatusBadRequest, "nama kategori wajib")
		return
	}
	c, err := h.categories.Create(r.Context(), store.ID, name)
	if err != nil {
		h.logger.Error("create category", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal simpan")
		return
	}
	h.audit.Log(r.Context(), store.ID, audit.Event{
		Action:     "category.created",
		EntityType: "category",
		EntityID:   c.ID.String(),
		Summary:    "Tambah kategori " + c.Name,
		Metadata:   map[string]any{"name": c.Name},
	})
	response.JSON(w, http.StatusCreated, map[string]any{
		"category": categoryDTO{ID: c.ID.String(), Name: c.Name, SortOrder: c.SortOrder},
	})
}

// PUT /api/v1/categories/{id}
func (h *CategoryHandler) Update(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req categoryReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		response.Error(w, http.StatusBadRequest, "nama kategori wajib")
		return
	}
	if err := h.categories.Rename(r.Context(), store.ID, id, name); err != nil {
		if errors.Is(err, repository.ErrCategoryNotFound) {
			response.Error(w, http.StatusNotFound, "kategori tidak ditemukan")
			return
		}
		response.Error(w, http.StatusInternalServerError, "gagal update")
		return
	}
	h.audit.Log(r.Context(), store.ID, audit.Event{
		Action:     "category.updated",
		EntityType: "category",
		EntityID:   id.String(),
		Summary:    "Rename kategori jadi " + name,
		Metadata:   map[string]any{"new_name": name},
	})
	response.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// DELETE /api/v1/categories/{id}
func (h *CategoryHandler) Delete(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.categories.Delete(r.Context(), store.ID, id); err != nil {
		if errors.Is(err, repository.ErrCategoryNotFound) {
			response.Error(w, http.StatusNotFound, "kategori tidak ditemukan")
			return
		}
		response.Error(w, http.StatusInternalServerError, "gagal hapus")
		return
	}
	h.audit.Log(r.Context(), store.ID, audit.Event{
		Action:     "category.deleted",
		EntityType: "category",
		EntityID:   id.String(),
		Summary:    "Hapus kategori",
	})
	response.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *CategoryHandler) storeFor(r *http.Request) (*repository.Store, error) {
	uid, _ := auth.UserIDFromContext(r.Context())
	return h.stores.FindByOwnerID(r.Context(), uid)
}
