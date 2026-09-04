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

	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/domain/feature"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
	"github.com/sellon/sellon/api/internal/storage"
)

// SellerBannerHandler manages per-store promo banners by placement
// (storefront / table_order / customer_queue). Mirrors the platform banner
// handler but tenant-scoped to the authenticated seller's store.
type SellerBannerHandler struct {
	banners *repository.SellerBannerRepo
	stores  *repository.StoreRepo
	subs    *repository.SubscriptionRepo
	storage storage.Client
	logger  *slog.Logger
}

func NewSellerBannerHandler(banners *repository.SellerBannerRepo, stores *repository.StoreRepo, subs *repository.SubscriptionRepo, storageCli storage.Client, logger *slog.Logger) *SellerBannerHandler {
	return &SellerBannerHandler{banners: banners, stores: stores, subs: subs, storage: storageCli, logger: logger}
}

// bannerPlacementBisnisOnly reports whether a placement is a dine-in / queue
// surface (gated to the Bisnis tier via feature.TableQR). The storefront
// placement is open to every plan.
func bannerPlacementBisnisOnly(placement string) bool {
	return placement == "table_order" || placement == "customer_queue"
}

func sellerBannerDTO(b repository.SellerBanner) map[string]any {
	return map[string]any{
		"id":         b.ID.String(),
		"placement":  b.Placement,
		"image_url":  b.ImageURL,
		"title":      b.Title,
		"link_url":   b.LinkURL,
		"is_active":  b.IsActive,
		"sort_order": b.SortOrder,
		"created_at": b.CreatedAt.Format(time.RFC3339),
	}
}

func (h *SellerBannerHandler) storeFor(r *http.Request) (*repository.Store, error) {
	uid, _ := auth.UserIDFromContext(r.Context())
	return h.stores.FindByOwnerID(r.Context(), uid)
}

// validBannerLink allows only empty or http(s) links. Banners render as anchor
// hrefs on public buyer-facing pages (storefront / table-order / queue), so
// reject javascript:/data: and other schemes to close the stored-XSS vector.
func validBannerLink(u string) bool {
	return u == "" || strings.HasPrefix(u, "http://") || strings.HasPrefix(u, "https://")
}

// GET /api/v1/store/banners — all of the seller's banners (management view).
func (h *SellerBannerHandler) List(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if errors.Is(err, repository.ErrStoreNotFound) {
		response.JSON(w, http.StatusOK, map[string]any{"banners": []any{}})
		return
	}
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	rows, err := h.banners.ListByStore(r.Context(), store.ID)
	if err != nil {
		h.logger.Error("seller banner list", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	out := make([]map[string]any, 0, len(rows))
	for _, b := range rows {
		out = append(out, sellerBannerDTO(b))
	}
	response.JSON(w, http.StatusOK, map[string]any{"banners": out})
}

// POST /api/v1/store/banners — multipart: file + placement (+ title, link_url,
// sort_order). Uploads to {store_id}/banners/ then inserts the row.
func (h *SellerBannerHandler) Create(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	if h.storage == nil || !h.storage.IsConfigured() {
		response.Error(w, http.StatusServiceUnavailable, "upload belum dikonfigurasi")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 16*1024*1024)
	if err := r.ParseMultipartForm(16 * 1024 * 1024); err != nil {
		response.Error(w, http.StatusBadRequest, "file terlalu besar (maks 15 MB)")
		return
	}

	placement := strings.TrimSpace(r.FormValue("placement"))
	if !repository.IsValidBannerPlacement(placement) {
		response.Error(w, http.StatusBadRequest, "placement tidak valid")
		return
	}

	// Order-meja / antrian banners are Bisnis-only (dine-in / queue surfaces).
	// Gate before reading the file so a locked plan never uploads an orphan.
	if bannerPlacementBisnisOnly(placement) {
		sub, err := h.subs.GetOrCreate(r.Context(), store.ID)
		if err != nil {
			h.logger.Error("seller banner sub lookup", "err", err)
			response.Error(w, http.StatusInternalServerError, "internal error")
			return
		}
		if !feature.HasFeature(sub.Plan, feature.TableQR) {
			response.JSON(w, http.StatusPaymentRequired, map[string]any{
				"code":       "FEATURE_LOCKED",
				"message":    "Banner untuk Order Meja & Antrian Pesanan tersedia di paket Bisnis",
				"feature":    string(feature.TableQR),
				"upgrade_to": "bisnis",
			})
			return
		}
	}

	linkURL := strings.TrimSpace(r.FormValue("link_url"))
	if !validBannerLink(linkURL) {
		response.Error(w, http.StatusBadRequest, "link harus diawali http:// atau https://")
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

	// Tenant-scoped storage path ({store_id}/...) so cross-tenant cleanup guards
	// hold and deletes stay within the store's namespace.
	key, err := storage.RandomKey(store.ID.String()+"/banners", ext)
	if err != nil {
		h.logger.Error("seller banner key", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	res, err := h.storage.Upload(r.Context(), key, contentType, body)
	if err != nil {
		h.logger.Error("seller banner upload", "err", err)
		response.Error(w, http.StatusBadGateway, "gagal upload ke storage")
		return
	}

	sortOrder, _ := strconv.Atoi(strings.TrimSpace(r.FormValue("sort_order")))
	if sortOrder < 0 {
		sortOrder = 0
	}
	b, err := h.banners.Create(r.Context(), repository.SellerBannerInput{
		StoreID:   store.ID,
		Placement: placement,
		ImageURL:  res.PublicURL,
		ImagePath: res.Path,
		Title:     strings.TrimSpace(r.FormValue("title")),
		LinkURL:   linkURL,
		SortOrder: sortOrder,
	})
	if err != nil {
		h.logger.Error("seller banner create", "err", err)
		go func(p string) {
			_ = h.storage.DeleteObjects(context.Background(), []string{p})
		}(res.Path)
		response.Error(w, http.StatusInternalServerError, "gagal menyimpan banner")
		return
	}
	response.JSON(w, http.StatusCreated, sellerBannerDTO(*b))
}

// PUT /api/v1/store/banners/{id} — JSON metadata (title, link, active, sort).
func (h *SellerBannerHandler) Update(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
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
	linkURL := strings.TrimSpace(req.LinkURL)
	if !validBannerLink(linkURL) {
		response.Error(w, http.StatusBadRequest, "link harus diawali http:// atau https://")
		return
	}
	sortOrder := req.SortOrder
	if sortOrder < 0 {
		sortOrder = 0
	}
	err = h.banners.Update(r.Context(), id, store.ID, repository.SellerBannerUpdate{
		Title:     strings.TrimSpace(req.Title),
		LinkURL:   linkURL,
		IsActive:  req.IsActive,
		SortOrder: sortOrder,
	})
	if errors.Is(err, repository.ErrSellerBannerNotFound) {
		response.Error(w, http.StatusNotFound, "banner tidak ditemukan")
		return
	}
	if err != nil {
		h.logger.Error("seller banner update", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

// DELETE /api/v1/store/banners/{id} — removes the row + its storage object.
func (h *SellerBannerHandler) Delete(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "id invalid")
		return
	}
	b, err := h.banners.Delete(r.Context(), id, store.ID)
	if errors.Is(err, repository.ErrSellerBannerNotFound) {
		response.Error(w, http.StatusNotFound, "banner tidak ditemukan")
		return
	}
	if err != nil {
		h.logger.Error("seller banner delete", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	if h.storage != nil && b.ImagePath != "" {
		go func(p string) {
			_ = h.storage.DeleteObjects(context.Background(), []string{p})
		}(b.ImagePath)
	}
	response.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

// GET /api/v1/storefront/{slug}/banners — PUBLIC. Active banners for the store,
// grouped by placement, for the storefront / table-order / queue display.
func (h *SellerBannerHandler) PublicList(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	store, err := h.stores.FindBySlug(r.Context(), slug)
	if err != nil {
		// Don't leak existence — just return empty groups.
		response.JSON(w, http.StatusOK, emptyBannerGroups())
		return
	}
	rows, err := h.banners.ListActiveByStore(r.Context(), store.ID)
	if err != nil {
		h.logger.Error("seller banner public list", "err", err)
		response.JSON(w, http.StatusOK, emptyBannerGroups())
		return
	}
	// Dine-in / queue banners require Bisnis. A store that downgraded must stop
	// surfacing leftover table_order/customer_queue banners publicly; storefront
	// stays open to all tiers. Fail open on a plan-lookup error so a paying
	// Bisnis seller never loses their banners to a transient DB blip.
	plan, planErr := h.subs.GetPlan(r.Context(), store.ID)
	allowBisnis := planErr != nil || feature.HasFeature(plan, feature.TableQR)

	groups := emptyBannerGroups()
	for _, b := range rows {
		if bannerPlacementBisnisOnly(b.Placement) && !allowBisnis {
			continue
		}
		arr, ok := groups[b.Placement].([]map[string]any)
		if !ok {
			continue
		}
		groups[b.Placement] = append(arr, map[string]any{
			"id":        b.ID.String(),
			"image_url": b.ImageURL,
			"link_url":  b.LinkURL,
			"title":     b.Title,
		})
	}
	response.JSON(w, http.StatusOK, groups)
}

func emptyBannerGroups() map[string]any {
	return map[string]any{
		"storefront":     []map[string]any{},
		"table_order":    []map[string]any{},
		"customer_queue": []map[string]any{},
	}
}
