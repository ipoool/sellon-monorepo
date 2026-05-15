package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/sellon/sellon/api/internal/audit"
	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/events"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
	"github.com/sellon/sellon/api/internal/storage"
)

type ProductHandler struct {
	products *repository.ProductRepo
	variants *repository.VariantRepo
	stores   *repository.StoreRepo
	subs     *repository.SubscriptionRepo
	plans    *repository.PlanRepo
	bulkJobs *repository.BulkJobRepo
	storage  *storage.SupabaseClient
	broker   *events.Broker
	audit    *audit.Logger
	logger   *slog.Logger
	// pool buat goroutine background — Context dari request dibuang
	// karena req sudah balas 202 sebelum job selesai. Worker punya
	// context.Background() sendiri yang independen.
	bulkPool *bulkJobRunner
}

func NewProductHandler(
	products *repository.ProductRepo,
	variants *repository.VariantRepo,
	stores *repository.StoreRepo,
	subs *repository.SubscriptionRepo,
	plans *repository.PlanRepo,
	bulkJobs *repository.BulkJobRepo,
	storageCli *storage.SupabaseClient,
	broker *events.Broker,
	audit *audit.Logger,
	logger *slog.Logger,
) *ProductHandler {
	h := &ProductHandler{
		products: products, variants: variants, stores: stores,
		subs:     subs,
		plans:    plans,
		bulkJobs: bulkJobs,
		storage:  storageCli,
		broker:   broker,
		audit:    audit,
		logger:   logger,
	}
	h.bulkPool = newBulkJobRunner(h)
	return h
}

// quotaCheck returns a non-nil error message string if creating `wantCount`
// new products would exceed the seller's tier limit. Caller surfaces with
// HTTP 402 Payment Required. Uses a bounded existence probe (HasAtLeast)
// so the check stays O(1) as the store grows.
func (h *ProductHandler) quotaCheck(r *http.Request, storeID uuid.UUID, wantCount int) (string, bool) {
	sub, err := h.subs.GetOrCreate(r.Context(), storeID)
	if err != nil {
		// Fail-open on subscription read errors — better to allow the create
		// than to brick the dashboard. Log handled by repo.
		return "", true
	}
	limit := productLimitForSub(sub)
	if limit < 0 {
		return "", true
	}
	// Over the cap iff existing rows >= limit - wantCount + 1.
	threshold := limit - wantCount + 1
	if threshold <= 0 {
		// wantCount alone exceeds the cap — block without even probing.
		return "Limit produk tier " + sub.Plan + " (" + strconv.Itoa(limit) +
			") tidak cukup untuk menambah " + strconv.Itoa(wantCount) +
			" produk. Upgrade ke Pro untuk produk tanpa batas.", false
	}
	over, err := h.products.HasAtLeast(r.Context(), storeID, threshold)
	if err != nil {
		return "", true
	}
	if over {
		return "Limit produk tier " + sub.Plan + " (" + strconv.Itoa(limit) +
			") sudah tercapai. Upgrade ke Pro untuk produk tanpa batas.", false
	}
	return "", true
}

type variantDTO struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	SKU        string `json:"sku"`
	PriceCents int64  `json:"price_cents"`
	Stock      int    `json:"stock"`
	SortOrder  int    `json:"sort_order"`
}

type productDTO struct {
	ID                  string       `json:"id"`
	CategoryID          string       `json:"category_id"`
	Name                string       `json:"name"`
	Slug                string       `json:"slug"`
	Description         string       `json:"description"`
	PriceCents          int64        `json:"price_cents"`
	Stock               int          `json:"stock"`
	LowStockThreshold   int          `json:"low_stock_threshold"`
	WeightG             int          `json:"weight_g"`
	LengthCm            int          `json:"length_cm"`
	WidthCm             int          `json:"width_cm"`
	HeightCm            int          `json:"height_cm"`
	Status              string       `json:"status"`
	PhotoURLs           []string     `json:"photo_urls"`
	HasVariants         bool         `json:"has_variants"`
	IsFeatured          bool         `json:"is_featured"`
	ProductType         string       `json:"product_type"`
	DigitalDeliveryURL  string       `json:"digital_delivery_url"`
	DigitalFileURL      string       `json:"digital_file_url"`
	DigitalInstructions string       `json:"digital_instructions"`
	Variants            []variantDTO `json:"variants"`
	// VariantsCount + VariantsStock are list-only aggregates so the dashboard
	// "Stok" column can show "N varian · stok M" instead of the parent's
	// stale stock cell. Zero when has_variants=false.
	VariantsCount int    `json:"variants_count"`
	VariantsStock int    `json:"variants_stock"`
	CreatedAt     string `json:"created_at"`
}

func toProductDTO(p *repository.Product, variants []repository.Variant) productDTO {
	categoryID := ""
	if p.CategoryID != nil {
		categoryID = p.CategoryID.String()
	}
	vDTOs := make([]variantDTO, 0, len(variants))
	for _, v := range variants {
		vDTOs = append(vDTOs, variantDTO{
			ID: v.ID.String(), Name: v.Name, SKU: v.SKU,
			PriceCents: v.PriceCents, Stock: v.Stock, SortOrder: v.SortOrder,
		})
	}
	productType := p.ProductType
	if productType == "" {
		productType = "physical"
	}
	return productDTO{
		ID: p.ID.String(), CategoryID: categoryID,
		Name: p.Name, Slug: p.Slug, Description: p.Description,
		PriceCents: p.PriceCents, Stock: p.Stock,
		LowStockThreshold: p.LowStockThreshold,
		WeightG: p.WeightG, LengthCm: p.LengthCm, WidthCm: p.WidthCm, HeightCm: p.HeightCm,
		Status: p.Status, PhotoURLs: p.PhotoURLs, HasVariants: p.HasVariants,
		IsFeatured:          p.IsFeatured,
		ProductType:         productType,
		DigitalDeliveryURL:  p.DigitalDeliveryURL,
		DigitalFileURL:      p.DigitalFileURL,
		DigitalInstructions: p.DigitalInstructions,
		Variants:            vDTOs,
		CreatedAt:           p.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
}

func (h *ProductHandler) requireStore(r *http.Request) (*repository.Store, error) {
	uid, _ := auth.UserIDFromContext(r.Context())
	return h.stores.FindByOwnerID(r.Context(), uid)
}

// GET /api/v1/products
func (h *ProductHandler) List(w http.ResponseWriter, r *http.Request) {
	store, err := h.requireStore(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	if limit == 0 {
		limit = 50
	}
	offset, _ := strconv.Atoi(q.Get("offset"))

	items, total, err := h.products.List(r.Context(), repository.ListProductsFilter{
		StoreID: store.ID,
		Search:  strings.TrimSpace(q.Get("q")),
		Status:  q.Get("status"),
		Limit:   limit,
		Offset:  offset,
	})
	if err != nil {
		h.logger.Error("list products", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	// Roll up variant count + stock per product in one query so the list
	// "Stok" column reflects per-variant edits (BUG-002). Falls back silently
	// to zero on error — the parent stock + count of 0 still renders.
	ids := make([]uuid.UUID, 0, len(items))
	for i := range items {
		if items[i].HasVariants {
			ids = append(ids, items[i].ID)
		}
	}
	aggs, err := h.variants.AggregateByProducts(r.Context(), ids)
	if err != nil {
		h.logger.Error("aggregate variants for list", "err", err)
		aggs = map[uuid.UUID]repository.VariantAggregate{}
	}

	out := make([]productDTO, 0, len(items))
	for i := range items {
		// List view doesn't fetch variants for each row (N+1 avoidance);
		// callers needing variants use GET /products/{id}.
		dto := toProductDTO(&items[i], nil)
		if agg, ok := aggs[items[i].ID]; ok {
			dto.VariantsCount = agg.Count
			dto.VariantsStock = agg.StockTotal
		}
		out = append(out, dto)
	}
	response.JSON(w, http.StatusOK, map[string]any{
		"products": out, "total": total,
	})
}

// GET /api/v1/products/{id}
func (h *ProductHandler) Get(w http.ResponseWriter, r *http.Request) {
	store, err := h.requireStore(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	p, err := h.products.FindByID(r.Context(), store.ID, id)
	if errors.Is(err, repository.ErrProductNotFound) {
		response.Error(w, http.StatusNotFound, "produk tidak ditemukan")
		return
	}
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	variants, _ := h.variants.ListByProduct(r.Context(), p.ID)
	response.JSON(w, http.StatusOK, map[string]any{"product": toProductDTO(p, variants)})
}

type variantInput struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	SKU        string `json:"sku"`
	PriceCents int64  `json:"price_cents"`
	Stock      int    `json:"stock"`
}

type productInput struct {
	CategoryID          string         `json:"category_id"`
	Name                string         `json:"name"`
	Slug                string         `json:"slug"`
	Description         string         `json:"description"`
	PriceCents          int64          `json:"price_cents"`
	Stock               int            `json:"stock"`
	LowStockThreshold   int            `json:"low_stock_threshold"`
	WeightG             int            `json:"weight_g"`
	LengthCm            int            `json:"length_cm"`
	WidthCm             int            `json:"width_cm"`
	HeightCm            int            `json:"height_cm"`
	Status              string         `json:"status"`
	PhotoURLs           []string       `json:"photo_urls"`
	IsFeatured          bool           `json:"is_featured"`
	ProductType         string         `json:"product_type"` // "physical" | "digital"
	DigitalDeliveryURL  string         `json:"digital_delivery_url"`
	DigitalFileURL      string         `json:"digital_file_url"`
	DigitalInstructions string         `json:"digital_instructions"`
	Variants            []variantInput `json:"variants"`
}

func (in productInput) sanitize() (repository.SaveProductInput, error) {
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" {
		return repository.SaveProductInput{}, errors.New("nama wajib")
	}
	if in.Slug == "" {
		in.Slug = sanitizeSlug(in.Name)
	} else {
		in.Slug = sanitizeSlug(in.Slug)
	}
	if in.PriceCents < 0 || in.Stock < 0 {
		return repository.SaveProductInput{}, errors.New("harga dan stok tidak boleh negatif")
	}
	if in.Status == "" {
		in.Status = "active"
	}
	if in.Status != "active" && in.Status != "inactive" && in.Status != "sold_out" {
		return repository.SaveProductInput{}, errors.New("status invalid")
	}
	if len(in.PhotoURLs) > 5 {
		in.PhotoURLs = in.PhotoURLs[:5]
	}
	if in.PhotoURLs == nil {
		in.PhotoURLs = []string{}
	}

	var categoryID *uuid.UUID
	if strings.TrimSpace(in.CategoryID) != "" {
		parsed, err := uuid.Parse(in.CategoryID)
		if err != nil {
			return repository.SaveProductInput{}, errors.New("category_id invalid")
		}
		categoryID = &parsed
	}

	if in.LowStockThreshold < 0 {
		in.LowStockThreshold = 0
	}

	productType := strings.ToLower(strings.TrimSpace(in.ProductType))
	if productType != "digital" {
		productType = "physical"
	}

	if productType == "digital" {
		// At least one delivery channel required (URL, file, or
		// instructions) — otherwise the buyer's download page would
		// show nothing useful.
		hasURL := strings.TrimSpace(in.DigitalDeliveryURL) != ""
		hasFile := strings.TrimSpace(in.DigitalFileURL) != ""
		hasInstr := strings.TrimSpace(in.DigitalInstructions) != ""
		if !hasURL && !hasFile && !hasInstr {
			return repository.SaveProductInput{}, errors.New(
				"produk digital butuh minimal salah satu dari: link, file upload, atau instruksi pengiriman")
		}
		// Stock for digital is meaningless; pin to a generous value so
		// the existing stock decrement code is fully short-circuited
		// by ProductType=digital but the DB still has a sensible value.
		in.Stock = 0
		// Ditto physical dimensions — zero them out.
		in.WeightG = 0
		in.LengthCm = 0
		in.WidthCm = 0
		in.HeightCm = 0
	}

	return repository.SaveProductInput{
		CategoryID: categoryID,
		Name: in.Name, Slug: in.Slug, Description: in.Description,
		PriceCents: in.PriceCents, Stock: in.Stock,
		LowStockThreshold: in.LowStockThreshold,
		WeightG: in.WeightG, LengthCm: in.LengthCm, WidthCm: in.WidthCm, HeightCm: in.HeightCm,
		Status: in.Status, PhotoURLs: in.PhotoURLs,
		IsFeatured:          in.IsFeatured,
		ProductType:         productType,
		DigitalDeliveryURL:  strings.TrimSpace(in.DigitalDeliveryURL),
		DigitalFileURL:      strings.TrimSpace(in.DigitalFileURL),
		DigitalInstructions: strings.TrimSpace(in.DigitalInstructions),
	}, nil
}

// POST /api/v1/products
func (h *ProductHandler) Create(w http.ResponseWriter, r *http.Request) {
	store, err := h.requireStore(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	var in productInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	saveIn, err := in.sanitize()
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	saveIn.StoreID = store.ID

	if msg, ok := h.quotaCheck(r, store.ID, 1); !ok {
		response.Error(w, http.StatusPaymentRequired, msg)
		return
	}

	p, err := h.products.Create(r.Context(), saveIn)
	if err != nil {
		h.logger.Error("create product", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal simpan (slug mungkin duplikat)")
		return
	}
	if err := h.syncVariants(r, p, in.Variants); err != nil {
		h.logger.Error("sync variants on create", "err", err)
	}
	variants, _ := h.variants.ListByProduct(r.Context(), p.ID)
	// Re-fetch product to pick up has_variants flag mutation
	p2, _ := h.products.FindByID(r.Context(), store.ID, p.ID)
	if p2 != nil {
		p = p2
	}
	h.audit.Log(r.Context(), store.ID, audit.Event{
		Action:     "product.created",
		EntityType: "product",
		EntityID:   p.ID.String(),
		Summary:    "Tambah produk " + p.Name,
		Metadata: map[string]any{
			"product_name": p.Name,
			"slug":         p.Slug,
			"price_cents":  p.PriceCents,
			"stock":        p.Stock,
			"status":       p.Status,
		},
	})
	response.JSON(w, http.StatusCreated, map[string]any{"product": toProductDTO(p, variants)})
}

// PUT /api/v1/products/{id}
func (h *ProductHandler) Update(w http.ResponseWriter, r *http.Request) {
	store, err := h.requireStore(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	var in productInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	saveIn, err := in.sanitize()
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	saveIn.StoreID = store.ID

	p, err := h.products.Update(r.Context(), id, saveIn)
	if errors.Is(err, repository.ErrProductNotFound) {
		response.Error(w, http.StatusNotFound, "produk tidak ditemukan")
		return
	}
	if err != nil {
		h.logger.Error("update product", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal update")
		return
	}
	if err := h.syncVariants(r, p, in.Variants); err != nil {
		h.logger.Error("sync variants on update", "err", err)
	}
	variants, _ := h.variants.ListByProduct(r.Context(), p.ID)
	p2, _ := h.products.FindByID(r.Context(), store.ID, p.ID)
	if p2 != nil {
		p = p2
	}
	h.audit.Log(r.Context(), store.ID, audit.Event{
		Action:     "product.updated",
		EntityType: "product",
		EntityID:   p.ID.String(),
		Summary:    "Update produk " + p.Name,
		Metadata: map[string]any{
			"product_name": p.Name,
			"price_cents":  p.PriceCents,
			"stock":        p.Stock,
			"status":       p.Status,
		},
	})
	response.JSON(w, http.StatusOK, map[string]any{"product": toProductDTO(p, variants)})
}

// syncVariants runs ReplaceForProduct with sanitized inputs. nil/empty
// variants array clears any existing variants and sets has_variants=false.
func (h *ProductHandler) syncVariants(r *http.Request, p *repository.Product, inputs []variantInput) error {
	clean := make([]repository.VariantInput, 0, len(inputs))
	for i, in := range inputs {
		name := strings.TrimSpace(in.Name)
		if name == "" {
			continue
		}
		clean = append(clean, repository.VariantInput{
			ID: in.ID, Name: name, SKU: strings.TrimSpace(in.SKU),
			PriceCents: in.PriceCents, Stock: in.Stock, SortOrder: i,
		})
	}
	return h.variants.ReplaceForProduct(r.Context(), p.ID, clean)
}

// POST /api/v1/products/bulk-delete
//
// Body: {"ids": ["uuid1", "uuid2", ...]}. Deletes all products yang
// match `ids` dan milik toko si seller. FE wajib show ConfirmDialog
// dengan typed phrase "DELETE ALL" — backend hanya guard sederhana
// (validasi UUID + ownership). Mengembalikan {deleted: N, failed: N}.
func (h *ProductHandler) BulkDelete(w http.ResponseWriter, r *http.Request) {
	store, err := h.requireStore(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	var body struct {
		IDs []string `json:"ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if len(body.IDs) == 0 {
		response.Error(w, http.StatusBadRequest, "tidak ada produk dipilih")
		return
	}
	if len(body.IDs) > 200 {
		response.Error(w, http.StatusBadRequest, "maksimal 200 produk per bulk delete")
		return
	}
	deleted := 0
	failed := 0
	names := make([]string, 0, len(body.IDs))
	// Kumpulkan semua object path Supabase dari produk yang berhasil
	// dihapus. Storage cleanup dijalankan setelah DB delete selesai
	// agar kalau cleanup gagal (mis. Supabase 5xx) DB tetap konsisten.
	photoPaths := make([]string, 0)
	for _, raw := range body.IDs {
		id, err := uuid.Parse(raw)
		if err != nil {
			failed++
			continue
		}
		// Capture name + photo URLs before delete (cascade akan hapus
		// rows; URL-nya bukan FK ke storage jadi harus di-snapshot dulu).
		preName := ""
		var preURLs []string
		if existing, _ := h.products.FindByID(r.Context(), store.ID, id); existing != nil {
			preName = existing.Name
			preURLs = existing.PhotoURLs
		}
		if err := h.products.Delete(r.Context(), store.ID, id); err != nil {
			failed++
			continue
		}
		deleted++
		if preName != "" {
			names = append(names, preName)
		}
		for _, u := range preURLs {
			if p := h.storage.PathFromPublicURL(u); p != "" {
				photoPaths = append(photoPaths, p)
			}
		}
	}

	// Async storage cleanup — DB sudah committed, gambar yang gagal
	// dihapus jadi orphan tapi tidak break UX. Pakai context.Background
	// karena request ctx bisa cancel saat respons keburu balik.
	if len(photoPaths) > 0 && h.storage != nil && h.storage.IsConfigured() {
		paths := photoPaths
		go func() {
			if err := h.storage.DeleteObjects(context.Background(), paths); err != nil {
				h.logger.Warn("supabase delete objects (bulk)", "err", err, "count", len(paths))
			}
		}()
	}
	if deleted > 0 {
		h.audit.Log(r.Context(), store.ID, audit.Event{
			Action:     "product.bulk_deleted",
			EntityType: "product",
			Summary:    "Bulk delete produk: " + strconv.Itoa(deleted) + " dihapus",
			Metadata: map[string]any{
				"deleted":       deleted,
				"failed":        failed,
				"product_names": names,
			},
		})
	}
	response.JSON(w, http.StatusOK, map[string]any{
		"deleted": deleted,
		"failed":  failed,
	})
}

// DELETE /api/v1/products/{id}
func (h *ProductHandler) Delete(w http.ResponseWriter, r *http.Request) {
	store, err := h.requireStore(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	// Capture name + photo URLs before delete (cascade akan hapus rows;
	// gambar di Supabase Storage harus di-cleanup manual).
	preName := ""
	var preURLs []string
	if existing, _ := h.products.FindByID(r.Context(), store.ID, id); existing != nil {
		preName = existing.Name
		preURLs = existing.PhotoURLs
	}
	if err := h.products.Delete(r.Context(), store.ID, id); err != nil {
		if errors.Is(err, repository.ErrProductNotFound) {
			response.Error(w, http.StatusNotFound, "produk tidak ditemukan")
			return
		}
		response.Error(w, http.StatusInternalServerError, "gagal hapus")
		return
	}
	// Async storage cleanup — gambar yang gagal dihapus jadi orphan
	// tapi tidak block UX. Pakai context.Background karena request ctx
	// bisa cancel saat respons sudah balik.
	if len(preURLs) > 0 && h.storage != nil && h.storage.IsConfigured() {
		paths := make([]string, 0, len(preURLs))
		for _, u := range preURLs {
			if p := h.storage.PathFromPublicURL(u); p != "" {
				paths = append(paths, p)
			}
		}
		if len(paths) > 0 {
			go func() {
				if err := h.storage.DeleteObjects(context.Background(), paths); err != nil {
					h.logger.Warn("supabase delete objects", "err", err, "count", len(paths))
				}
			}()
		}
	}
	summary := "Hapus produk"
	if preName != "" {
		summary = "Hapus produk " + preName
	}
	h.audit.Log(r.Context(), store.ID, audit.Event{
		Action:     "product.deleted",
		EntityType: "product",
		EntityID:   id.String(),
		Summary:    summary,
		Metadata:   map[string]any{"product_name": preName},
	})
	response.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// POST /api/v1/products/{id}/duplicate — clone a product (incl. variants).
// Name suffix: " (Salinan)"; slug suffix: -salinan / -salinan-2 / -salinan-3
// to avoid the unique (store_id, slug) constraint. Bahasa per project
// convention (BUG-033).
func (h *ProductHandler) Duplicate(w http.ResponseWriter, r *http.Request) {
	store, err := h.requireStore(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	if msg, ok := h.quotaCheck(r, store.ID, 1); !ok {
		response.Error(w, http.StatusPaymentRequired, msg)
		return
	}
	src, err := h.products.FindByID(r.Context(), store.ID, id)
	if err != nil {
		response.Error(w, http.StatusNotFound, "produk sumber tidak ditemukan")
		return
	}

	// Find a free slug. Try "{slug}-salinan", then "-salinan-2", "-salinan-3", …
	newSlug := src.Slug + "-salinan"
	for n := 2; ; n++ {
		_, err := h.products.FindBySlug(r.Context(), store.ID, newSlug)
		if errors.Is(err, repository.ErrProductNotFound) {
			break
		}
		if err != nil {
			h.logger.Error("duplicate: slug probe", "err", err)
			response.Error(w, http.StatusInternalServerError, "internal error")
			return
		}
		newSlug = src.Slug + "-salinan-" + strconv.Itoa(n)
		if n > 50 {
			response.Error(w, http.StatusConflict, "tidak bisa generate slug unik untuk salinan")
			return
		}
	}

	// Make a copy as a draft (status = inactive) so the seller can review
	// before publishing. Stock is preserved; the seller usually wants the
	// same baseline.
	copyIn := repository.SaveProductInput{
		StoreID:           store.ID,
		CategoryID:        src.CategoryID,
		Name:              src.Name + " (Salinan)",
		Slug:              newSlug,
		Description:       src.Description,
		PriceCents:        src.PriceCents,
		Stock:             src.Stock,
		LowStockThreshold: src.LowStockThreshold,
		WeightG:           src.WeightG,
		LengthCm:          src.LengthCm,
		WidthCm:           src.WidthCm,
		HeightCm:          src.HeightCm,
		Status:            "inactive",
		// Force a non-nil slice so the NOT NULL photo_urls column accepts
		// the INSERT even when the source had no photos.
		PhotoURLs:           append([]string{}, src.PhotoURLs...),
		IsFeatured:          false,
		ProductType:         src.ProductType,
		DigitalDeliveryURL:  src.DigitalDeliveryURL,
		DigitalFileURL:      src.DigitalFileURL,
		DigitalInstructions: src.DigitalInstructions,
	}
	created, err := h.products.Create(r.Context(), copyIn)
	if err != nil {
		h.logger.Error("duplicate product", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal duplikat")
		return
	}

	// Clone variants if any.
	if src.HasVariants {
		srcVars, err := h.variants.ListByProduct(r.Context(), src.ID)
		if err == nil && len(srcVars) > 0 {
			inputs := make([]repository.VariantInput, 0, len(srcVars))
			for _, v := range srcVars {
				inputs = append(inputs, repository.VariantInput{
					Name:       v.Name,
					SKU:        v.SKU, // SKU may need uniqueness handling in future
					PriceCents: v.PriceCents,
					Stock:      v.Stock,
					SortOrder:  v.SortOrder,
				})
			}
			if err := h.variants.ReplaceForProduct(r.Context(), created.ID, inputs); err != nil {
				h.logger.Error("duplicate: clone variants", "err", err)
				// Parent saved already — return success but log; seller can fix
				// via the edit page.
			}
		}
	}

	h.audit.Log(r.Context(), store.ID, audit.Event{
		Action:     "product.duplicated",
		EntityType: "product",
		EntityID:   created.ID.String(),
		Summary:    "Duplikat produk " + src.Name,
		Metadata: map[string]any{
			"source_product_id": src.ID.String(),
			"source_name":       src.Name,
			"new_name":          created.Name,
			"new_slug":          created.Slug,
		},
	})
	response.JSON(w, http.StatusCreated, map[string]any{
		"product": toProductDTO(created, nil),
	})
}

