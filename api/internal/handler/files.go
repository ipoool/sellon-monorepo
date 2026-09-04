package handler

import (
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/storage"
)

// FilesHandler serves uploaded assets out of the PRIVATE object bucket.
//
// The bucket allows no anonymous access, and this provider ignores
// per-object ACLs, so a storefront image cannot be linked straight to the
// object store. Every stored asset URL therefore points here, and this
// handler is the only thing holding storage credentials on the read path.
//
// It is deliberately unauthenticated: these are the same assets a public
// storefront renders (product photos, logo, banner, QRIS), and a buyer's
// browser has no session. What protects them is that object keys carry 8
// random bytes, and that the bucket itself exposes no listing — so a URL
// cannot be guessed or enumerated, only followed if someone already has it.
//
// Because the bucket is private, tightening this later (gating the
// `{store_id}/digital/` prefix behind the buyer-OTP session, say) is a
// change to THIS handler alone and needs no re-upload or URL rewrite.
type FilesHandler struct {
	storage storage.Client
	logger  *slog.Logger
}

func NewFilesHandler(storageCli storage.Client, logger *slog.Logger) *FilesHandler {
	return &FilesHandler{storage: storageCli, logger: logger}
}

// GET /api/v1/files/*
func (h *FilesHandler) Serve(w http.ResponseWriter, r *http.Request) {
	key := strings.TrimPrefix(r.URL.Path, "/api/v1/files/")
	key = strings.TrimLeft(key, "/")
	if key == "" {
		response.Error(w, http.StatusNotFound, "file tidak ditemukan")
		return
	}
	// Path traversal guard. Keys are built server-side, but this endpoint
	// takes the key straight off the URL, so never let one escape its
	// prefix into another tenant's objects.
	if strings.Contains(key, "..") {
		response.Error(w, http.StatusBadRequest, "path tidak valid")
		return
	}

	if h.storage == nil || !h.storage.IsConfigured() {
		response.Error(w, http.StatusServiceUnavailable, "storage belum dikonfigurasi")
		return
	}

	obj, err := h.storage.Get(r.Context(), key, r.Header.Get("If-None-Match"))
	switch {
	case storage.IsNotModified(err):
		// Browser already has it; no body, no upstream transfer.
		if obj != nil && obj.ETag != "" {
			w.Header().Set("ETag", obj.ETag)
		}
		setAssetCacheHeaders(w)
		w.WriteHeader(http.StatusNotModified)
		return
	case errors.Is(err, storage.ErrObjectNotFound):
		response.Error(w, http.StatusNotFound, "file tidak ditemukan")
		return
	case err != nil:
		h.logger.Warn("files proxy read", "err", err, "key", key)
		response.Error(w, http.StatusBadGateway, "gagal mengambil file")
		return
	}
	defer obj.Body.Close()

	if obj.ContentType != "" {
		w.Header().Set("Content-Type", obj.ContentType)
	}
	if obj.ContentLength >= 0 {
		w.Header().Set("Content-Length", strconv.FormatInt(obj.ContentLength, 10))
	}
	if obj.ETag != "" {
		w.Header().Set("ETag", obj.ETag)
	}
	if obj.LastModified != "" {
		w.Header().Set("Last-Modified", obj.LastModified)
	}
	// Never let a browser sniff an uploaded file into something executable.
	w.Header().Set("X-Content-Type-Options", "nosniff")
	setAssetCacheHeaders(w)

	if _, err := io.Copy(w, obj.Body); err != nil {
		// Client hung up mid-image, or upstream died. Headers are already
		// out so there's nothing to report but a log line.
		h.logger.Debug("files proxy copy interrupted", "err", err, "key", key)
	}
}

// setAssetCacheHeaders marks the response immutable. Object keys embed 8
// random bytes and are never rewritten in place, so a given URL's bytes can
// never change — which is what makes a one-year cache safe and keeps repeat
// storefront views off the object store entirely.
func setAssetCacheHeaders(w http.ResponseWriter) {
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
}
