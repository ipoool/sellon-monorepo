package handler

import (
	"io"
	"log/slog"
	"net/http"
	"path"
	"strings"

	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
	"github.com/sellon/sellon/api/internal/storage"
)

type UploadHandler struct {
	stores  *repository.StoreRepo
	storage *storage.SupabaseClient
	logger  *slog.Logger
}

func NewUploadHandler(stores *repository.StoreRepo, storageCli *storage.SupabaseClient, logger *slog.Logger) *UploadHandler {
	return &UploadHandler{stores: stores, storage: storageCli, logger: logger}
}

// Whitelist of allowed `kind` values. Each maps to a path prefix inside
// the bucket so we can audit what's where without scanning everything.
var allowedUploadKinds = map[string]string{
	"product": "products",
	"logo":    "logos",
	"banner":  "banners",
	"qris":    "qris",
	"general": "misc",
}

// POST /api/v1/uploads/image (multipart "file" + optional "kind")
//
// One endpoint for every image-upload field in the dashboard. Auth-gated
// + size capped + mime checked + tenant-prefixed in the bucket so each
// store's uploads are namespaced.
func (h *UploadHandler) Image(w http.ResponseWriter, r *http.Request) {
	if h.storage == nil || !h.storage.IsConfigured() {
		response.Error(w, http.StatusServiceUnavailable, "upload belum dikonfigurasi")
		return
	}
	uid, _ := auth.UserIDFromContext(r.Context())
	store, err := h.stores.FindByOwnerID(r.Context(), uid)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 6*1024*1024)
	if err := r.ParseMultipartForm(6 * 1024 * 1024); err != nil {
		response.Error(w, http.StatusBadRequest, "file terlalu besar (maks 5 MB)")
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		response.Error(w, http.StatusBadRequest, "file tidak ada di body")
		return
	}
	defer file.Close()

	if header.Size > 5*1024*1024 {
		response.Error(w, http.StatusBadRequest, "ukuran maks 5 MB")
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

	kind := strings.ToLower(strings.TrimSpace(r.FormValue("kind")))
	if kind == "" {
		kind = "general"
	}
	prefix, ok := allowedUploadKinds[kind]
	if !ok {
		response.Error(w, http.StatusBadRequest, "kind tidak valid")
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

	key, err := storage.RandomKey(prefix+"/"+store.ID.String(), ext)
	if err != nil {
		h.logger.Error("random key", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	res, err := h.storage.Upload(r.Context(), key, contentType, body)
	if err != nil {
		h.logger.Error("supabase upload", "err", err, "store", store.ID.String(), "kind", kind)
		response.Error(w, http.StatusBadGateway, "gagal upload ke storage")
		return
	}
	response.JSON(w, http.StatusCreated, map[string]any{
		"url":  res.PublicURL,
		"path": res.Path,
	})
}
