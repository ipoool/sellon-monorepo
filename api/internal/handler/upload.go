package handler

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"regexp"
	"strings"

	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/imagex"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
	"github.com/sellon/sellon/api/internal/storage"
)

type UploadHandler struct {
	stores  *repository.StoreRepo
	storage storage.Client
	logger  *slog.Logger
}

func NewUploadHandler(stores *repository.StoreRepo, storageCli storage.Client, logger *slog.Logger) *UploadHandler {
	return &UploadHandler{stores: stores, storage: storageCli, logger: logger}
}

// Whitelist `kind` → sub-path **relative ke folder per-store**. Final
// key: `{store_id}/{kindPath}/{stamp}-{hex}.{ext}` di bucket `stores`.
//
// Skema:
//
//	stores/{store_id}/products/...      → katalog produk
//	stores/{store_id}/commons/logos/... → branding (logo toko)
//	stores/{store_id}/commons/banners/... → header storefront
//	stores/{store_id}/commons/qris/...  → QRIS static toko
//	stores/{store_id}/commons/misc/...  → upload bebas (footer image, dll)
//
// "commons" = bucket per-toko untuk asset non-katalog supaya audit /
// quota / cleanup per-toko tetap mudah (delete folder = wipe semua
// branding store).
var allowedUploadKinds = map[string]string{
	"product": "products",
	"logo":    "commons/logos",
	"banner":  "commons/banners",
	"qris":    "commons/qris",
	"general": "commons/misc",
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

	// Cap upload di 16 MB supaya foto kamera HP modern (8-12 MB JPEG)
	// tidak rejected sebelum sempat di-compress. Untuk product image
	// pipeline akan ditekan ke <= 2 MB; untuk logo/banner/qris biasanya
	// sudah jauh di bawah cap.
	r.Body = http.MaxBytesReader(w, r.Body, 16*1024*1024)
	if err := r.ParseMultipartForm(16 * 1024 * 1024); err != nil {
		response.Error(w, http.StatusBadRequest, "file terlalu besar (maks 15 MB)")
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		response.Error(w, http.StatusBadRequest, "file tidak ada di body")
		return
	}
	defer file.Close()

	if header.Size > 15*1024*1024 {
		response.Error(w, http.StatusBadRequest, "ukuran maks 15 MB")
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

	// Sniff the real type from the bytes instead of trusting the multipart
	// part's Content-Type header (client-controlled — a .exe can claim
	// image/png). The sniffed type also drives the stored extension so the
	// public URL never disagrees with the body.
	contentType := sniffContentType(body)
	switch contentType {
	case "image/jpeg", "image/png", "image/webp", "image/gif":
		// ok
	default:
		response.Error(w, http.StatusBadRequest, "format harus JPG/PNG/WebP/GIF")
		return
	}

	// Decompression-bomb guard: reject header-declared resolutions that would
	// allocate gigabytes on decode, before anything touches image.Decode.
	if err := imagex.ValidateDimensions(body); err != nil {
		h.logger.Warn("reject oversized image",
			"err", err, "store", store.ID.String(), "bytes", len(body))
		response.Error(w, http.StatusBadRequest, "resolusi gambar terlalu besar")
		return
	}

	// Product images: compress + resize ke <= 2 MB + width 1600 max
	// supaya storage hemat dan loading storefront cepat. Foto logo /
	// banner / qris tidak ikut compress karena ukurannya sudah kecil
	// dan kadang punya transparency yang penting (logo PNG).
	if kind == "product" {
		compressed, newType, cerr := imagex.CompressProductImage(body, contentType)
		if cerr != nil {
			h.logger.Error("compress product image",
				"err", cerr, "store", store.ID.String(),
				"orig_bytes", len(body), "orig_type", contentType)
			response.Error(w, http.StatusBadRequest, "gagal proses gambar")
			return
		}
		h.logger.Info("compressed product image",
			"store", store.ID.String(),
			"orig_bytes", len(body), "new_bytes", len(compressed),
			"orig_type", contentType, "new_type", newType)
		body = compressed
		contentType = newType
	}

	// Extension always comes from the (post-compression) content type, never
	// from the client filename — a crafted `foo.php` name must not become part
	// of the object key.
	ext := "jpg"
	switch contentType {
	case "image/png":
		ext = "png"
	case "image/webp":
		ext = "webp"
	case "image/gif":
		ext = "gif"
	}

	// Path scheme: {store_id}/{prefix}/{stamp}-{hex}.{ext}.
	// Store_id di depan supaya per-store folder gampang di-audit / di-
	// purge sekaligus (mis. seller churn → drop entire prefix).
	key, err := storage.RandomKey(store.ID.String()+"/"+prefix, ext)
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

// POST /api/v1/uploads/delete
//
// Body: {"url": "https://...supabase.co/storage/v1/object/public/stores/..."}
// Hapus satu object dari bucket. Dipakai FE saat seller ganti logo /
// banner — file lama yang sudah tidak direferensikan dibersihkan agar
// storage tidak bocor.
//
// Defense: URL harus map ke path yang berawalan `{store_id}/` milik
// seller saat ini. Mencegah cross-tenant delete kalau ada bug FE yang
// kirim URL sembarang.
func (h *UploadHandler) Delete(w http.ResponseWriter, r *http.Request) {
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

	var body struct {
		URL string `json:"url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	body.URL = strings.TrimSpace(body.URL)
	if body.URL == "" {
		response.Error(w, http.StatusBadRequest, "url wajib")
		return
	}

	objPath := h.storage.PathFromPublicURL(body.URL)
	if objPath == "" {
		// URL bukan dari bucket yang di-configure — abaikan (200 OK)
		// karena seller mungkin pernah upload ke domain lain di masa
		// lalu; jangan kasih error supaya FE bisa fire-and-forget.
		response.JSON(w, http.StatusOK, map[string]bool{"ok": true, "skipped": true})
		return
	}

	// Cross-tenant guard.
	prefix := store.ID.String() + "/"
	if !strings.HasPrefix(objPath, prefix) {
		response.Error(w, http.StatusForbidden, "file bukan milik toko ini")
		return
	}

	if err := h.storage.DeleteObjects(r.Context(), []string{objPath}); err != nil {
		h.logger.Warn("supabase delete object", "err", err, "path", objPath)
		// Tetap balas 200 — orphan storage tidak break user flow; warning
		// log cukup untuk monitoring.
		response.JSON(w, http.StatusOK, map[string]any{"ok": true, "warn": err.Error()})
		return
	}
	response.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// === Digital file upload ===

// digitalFileMaxBytes caps a seller's digital deliverable. Bigger files belong
// on Drive/Dropbox with the "Link Akses" field instead of our bucket.
const digitalFileMaxBytes = 25 * 1024 * 1024

// digitalTypeExts allowlists digital deliverables by SNIFFED content type and
// maps each to the extensions we're willing to store. First entry is the
// default; a client-supplied extension is honoured only when it appears in the
// list for the sniffed type (epub/zip and jpg/jpeg are indistinguishable from
// the magic bytes alone).
//
// Note: http.DetectContentType never returns text/csv — a CSV sniffs as
// text/plain, hence csv/md living under that key.
var digitalTypeExts = map[string][]string{
	"application/pdf":      {"pdf"},
	"application/zip":      {"zip", "epub"},
	"application/epub+zip": {"epub"},
	"audio/mpeg":           {"mp3"},
	"video/mp4":            {"mp4"},
	"image/png":            {"png"},
	"image/jpeg":           {"jpg", "jpeg"},
	"image/webp":           {"webp"},
	"text/plain":           {"txt", "csv", "md"},
}

// safeExtRe keeps object keys boring: lowercase alphanumeric, at most 5 chars.
var safeExtRe = regexp.MustCompile(`^[a-z0-9]{1,5}$`)

// sniffContentType returns the media type detected from the first 512 bytes,
// with any charset/boundary parameter stripped.
func sniffContentType(body []byte) string {
	head := body
	if len(head) > 512 {
		head = head[:512]
	}
	ct := http.DetectContentType(head)
	if i := strings.IndexByte(ct, ';'); i >= 0 {
		ct = ct[:i]
	}
	return strings.ToLower(strings.TrimSpace(ct))
}

// clientExt pulls a sanitized extension out of the uploaded filename. Returns
// "" when the name has none or it fails the safe-extension shape.
func clientExt(filename string) string {
	i := strings.LastIndexByte(filename, '.')
	if i < 0 || i == len(filename)-1 {
		return ""
	}
	ext := strings.ToLower(filename[i+1:])
	if !safeExtRe.MatchString(ext) {
		return ""
	}
	return ext
}

// POST /api/v1/uploads/file (multipart "file")
//
// Seller-facing upload for DIGITAL product deliverables (kind = "digital").
// Unlike /uploads/image this accepts non-image payloads (PDF/zip/audio/video/
// text), caps at 25 MB, and never re-encodes the body — a JPEG re-encode of a
// buyer's deliverable would corrupt it.
//
// Object key: {store_id}/digital/{stamp}-{hex}.{ext}
func (h *UploadHandler) File(w http.ResponseWriter, r *http.Request) {
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

	r.Body = http.MaxBytesReader(w, r.Body, digitalFileMaxBytes)
	if err := r.ParseMultipartForm(8 << 20); err != nil {
		response.Error(w, http.StatusBadRequest, "file terlalu besar (maks 25 MB)")
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		response.Error(w, http.StatusBadRequest, "file tidak ada di body")
		return
	}
	defer file.Close()
	if header.Size > digitalFileMaxBytes {
		response.Error(w, http.StatusBadRequest, "ukuran maks 25 MB")
		return
	}

	body, err := io.ReadAll(file)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "gagal baca file")
		return
	}
	if len(body) == 0 {
		response.Error(w, http.StatusBadRequest, "file kosong")
		return
	}

	contentType := sniffContentType(body)
	exts, ok := digitalTypeExts[contentType]
	if !ok || len(exts) == 0 {
		response.Error(w, http.StatusBadRequest,
			"format file tidak didukung. Pakai PDF, ZIP/EPUB, MP3, MP4, gambar (PNG/JPG/WebP), atau teks (TXT/CSV)")
		return
	}
	// Images still go through the resolution guard — a digital "deliverable"
	// that happens to be a PNG can be a decompression bomb just the same.
	if strings.HasPrefix(contentType, "image/") {
		if err := imagex.ValidateDimensions(body); err != nil {
			response.Error(w, http.StatusBadRequest, "resolusi gambar terlalu besar")
			return
		}
	}

	ext := exts[0]
	if ce := clientExt(header.Filename); ce != "" {
		for _, allowed := range exts {
			if ce == allowed {
				ext = ce
				break
			}
		}
	}
	if !safeExtRe.MatchString(ext) {
		ext = "bin"
	}

	key, err := storage.RandomKey(store.ID.String()+"/digital", ext)
	if err != nil {
		h.logger.Error("random key", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	res, err := h.storage.Upload(r.Context(), key, contentType, body)
	if err != nil {
		h.logger.Error("supabase upload (digital)", "err", err, "store", store.ID.String())
		response.Error(w, http.StatusBadGateway, "gagal upload ke storage")
		return
	}
	h.logger.Info("uploaded digital file",
		"store", store.ID.String(), "bytes", len(body), "type", contentType)
	response.JSON(w, http.StatusCreated, map[string]any{
		"url":  res.PublicURL,
		"path": res.Path,
		"size": len(body),
		"type": contentType,
	})
}
