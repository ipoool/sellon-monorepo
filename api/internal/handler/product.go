package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
	"github.com/sellon/sellon/api/internal/storage"
)

type ProductHandler struct {
	products *repository.ProductRepo
	variants *repository.VariantRepo
	stores   *repository.StoreRepo
	subs     *repository.SubscriptionRepo
	storage  *storage.SupabaseClient
	logger   *slog.Logger
}

func NewProductHandler(products *repository.ProductRepo, variants *repository.VariantRepo, stores *repository.StoreRepo, subs *repository.SubscriptionRepo, storageCli *storage.SupabaseClient, logger *slog.Logger) *ProductHandler {
	return &ProductHandler{
		products: products, variants: variants, stores: stores,
		subs:    subs,
		storage: storageCli, logger: logger,
	}
}

// quotaCheck returns a non-nil error message string if creating `wantCount`
// new products would exceed the seller's tier limit. Caller surfaces with
// HTTP 402 Payment Required.
func (h *ProductHandler) quotaCheck(r *http.Request, storeID uuid.UUID, wantCount int) (string, bool) {
	sub, err := h.subs.GetOrCreate(r.Context(), storeID)
	if err != nil {
		// Fail-open on subscription read errors — better to allow the create
		// than to brick the dashboard. Log handled by repo.
		return "", true
	}
	limit := productLimitForPlan(sub.Plan)
	if limit < 0 {
		return "", true
	}
	current, err := h.products.CountAll(r.Context(), storeID)
	if err != nil {
		return "", true
	}
	if current+wantCount > limit {
		return "Limit produk tier " + sub.Plan + " sudah tercapai (" +
			strconv.Itoa(current) + "/" + strconv.Itoa(limit) +
			"). Upgrade ke Pro untuk produk tanpa batas.", false
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
	ID                string       `json:"id"`
	CategoryID        string       `json:"category_id"`
	Name              string       `json:"name"`
	Slug              string       `json:"slug"`
	Description       string       `json:"description"`
	PriceCents        int64        `json:"price_cents"`
	Stock             int          `json:"stock"`
	LowStockThreshold int          `json:"low_stock_threshold"`
	WeightG           int          `json:"weight_g"`
	LengthCm          int          `json:"length_cm"`
	WidthCm           int          `json:"width_cm"`
	HeightCm          int          `json:"height_cm"`
	Status            string       `json:"status"`
	PhotoURLs         []string     `json:"photo_urls"`
	HasVariants       bool         `json:"has_variants"`
	IsFeatured        bool         `json:"is_featured"`
	Variants          []variantDTO `json:"variants"`
	CreatedAt         string       `json:"created_at"`
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
	return productDTO{
		ID: p.ID.String(), CategoryID: categoryID,
		Name: p.Name, Slug: p.Slug, Description: p.Description,
		PriceCents: p.PriceCents, Stock: p.Stock,
		LowStockThreshold: p.LowStockThreshold,
		WeightG: p.WeightG, LengthCm: p.LengthCm, WidthCm: p.WidthCm, HeightCm: p.HeightCm,
		Status: p.Status, PhotoURLs: p.PhotoURLs, HasVariants: p.HasVariants,
		IsFeatured: p.IsFeatured,
		Variants:   vDTOs,
		CreatedAt:  p.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
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
	out := make([]productDTO, 0, len(items))
	for i := range items {
		// List view doesn't fetch variants for each row (N+1 avoidance);
		// callers needing variants use GET /products/{id}.
		out = append(out, toProductDTO(&items[i], nil))
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
	CategoryID        string         `json:"category_id"`
	Name              string         `json:"name"`
	Slug              string         `json:"slug"`
	Description       string         `json:"description"`
	PriceCents        int64          `json:"price_cents"`
	Stock             int            `json:"stock"`
	LowStockThreshold int            `json:"low_stock_threshold"`
	WeightG           int            `json:"weight_g"`
	LengthCm          int            `json:"length_cm"`
	WidthCm           int            `json:"width_cm"`
	HeightCm          int            `json:"height_cm"`
	Status            string         `json:"status"`
	PhotoURLs         []string       `json:"photo_urls"`
	IsFeatured        bool           `json:"is_featured"`
	Variants          []variantInput `json:"variants"`
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

	return repository.SaveProductInput{
		CategoryID: categoryID,
		Name: in.Name, Slug: in.Slug, Description: in.Description,
		PriceCents: in.PriceCents, Stock: in.Stock,
		LowStockThreshold: in.LowStockThreshold,
		WeightG: in.WeightG, LengthCm: in.LengthCm, WidthCm: in.WidthCm, HeightCm: in.HeightCm,
		Status: in.Status, PhotoURLs: in.PhotoURLs,
		IsFeatured: in.IsFeatured,
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
	if err := h.products.Delete(r.Context(), store.ID, id); err != nil {
		if errors.Is(err, repository.ErrProductNotFound) {
			response.Error(w, http.StatusNotFound, "produk tidak ditemukan")
			return
		}
		response.Error(w, http.StatusInternalServerError, "gagal hapus")
		return
	}
	response.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// POST /api/v1/products/{id}/duplicate — clone a product (incl. variants).
// Name suffix: " (Copy)"; slug suffix: -copy / -copy-2 / -copy-3 to avoid
// the unique (store_id, slug) constraint.
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

	// Find a free slug. Try "{slug}-copy", then "-copy-2", -copy-3, …
	newSlug := src.Slug + "-copy"
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
		newSlug = src.Slug + "-copy-" + strconv.Itoa(n)
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
		Name:              src.Name + " (Copy)",
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
		PhotoURLs: append([]string{}, src.PhotoURLs...),
		IsFeatured:        false,
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

	response.JSON(w, http.StatusCreated, map[string]any{
		"product": toProductDTO(created, nil),
	})
}

