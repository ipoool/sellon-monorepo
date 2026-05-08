package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

type WATemplateHandler struct {
	templates *repository.WATemplateRepo
	stores    *repository.StoreRepo
	logger    *slog.Logger
}

func NewWATemplateHandler(t *repository.WATemplateRepo, s *repository.StoreRepo, logger *slog.Logger) *WATemplateHandler {
	return &WATemplateHandler{templates: t, stores: s, logger: logger}
}

// GET /api/v1/whatsapp-templates
func (h *WATemplateHandler) Get(w http.ResponseWriter, r *http.Request) {
	uid, _ := auth.UserIDFromContext(r.Context())
	store, err := h.stores.FindByOwnerID(r.Context(), uid)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	m, err := h.templates.ListByStore(r.Context(), store.ID)
	if err != nil {
		h.logger.Error("list wa templates", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"templates": m})
}

type saveTemplatesReq struct {
	Templates map[string]string `json:"templates"`
}

// PUT /api/v1/whatsapp-templates
func (h *WATemplateHandler) Save(w http.ResponseWriter, r *http.Request) {
	uid, _ := auth.UserIDFromContext(r.Context())
	store, err := h.stores.FindByOwnerID(r.Context(), uid)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	var req saveTemplatesReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	for k, b := range req.Templates {
		if err := h.templates.Upsert(r.Context(), store.ID, k, b); err != nil {
			h.logger.Error("upsert wa template", "key", k, "err", err)
			response.Error(w, http.StatusInternalServerError, "gagal simpan")
			return
		}
	}
	response.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}
