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
)

type ProductHandler struct {
	products *repository.ProductRepo
	stores   *repository.StoreRepo
	logger   *slog.Logger
}

func NewProductHandler(products *repository.ProductRepo, stores *repository.StoreRepo, logger *slog.Logger) *ProductHandler {
	return &ProductHandler{products: products, stores: stores, logger: logger}
}

type productDTO struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Slug        string   `json:"slug"`
	Description string   `json:"description"`
	PriceCents  int64    `json:"price_cents"`
	Stock       int      `json:"stock"`
	WeightG     int      `json:"weight_g"`
	LengthCm    int      `json:"length_cm"`
	WidthCm     int      `json:"width_cm"`
	HeightCm    int      `json:"height_cm"`
	Status      string   `json:"status"`
	PhotoURLs   []string `json:"photo_urls"`
	HasVariants bool     `json:"has_variants"`
	CreatedAt   string   `json:"created_at"`
}

func toProductDTO(p *repository.Product) productDTO {
	return productDTO{
		ID: p.ID.String(), Name: p.Name, Slug: p.Slug, Description: p.Description,
		PriceCents: p.PriceCents, Stock: p.Stock,
		WeightG: p.WeightG, LengthCm: p.LengthCm, WidthCm: p.WidthCm, HeightCm: p.HeightCm,
		Status: p.Status, PhotoURLs: p.PhotoURLs, HasVariants: p.HasVariants,
		CreatedAt: p.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
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
		out = append(out, toProductDTO(&items[i]))
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
	response.JSON(w, http.StatusOK, map[string]any{"product": toProductDTO(p)})
}

type productInput struct {
	Name        string   `json:"name"`
	Slug        string   `json:"slug"`
	Description string   `json:"description"`
	PriceCents  int64    `json:"price_cents"`
	Stock       int      `json:"stock"`
	WeightG     int      `json:"weight_g"`
	LengthCm    int      `json:"length_cm"`
	WidthCm     int      `json:"width_cm"`
	HeightCm    int      `json:"height_cm"`
	Status      string   `json:"status"`
	PhotoURLs   []string `json:"photo_urls"`
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
	return repository.SaveProductInput{
		Name: in.Name, Slug: in.Slug, Description: in.Description,
		PriceCents: in.PriceCents, Stock: in.Stock,
		WeightG: in.WeightG, LengthCm: in.LengthCm, WidthCm: in.WidthCm, HeightCm: in.HeightCm,
		Status: in.Status, PhotoURLs: in.PhotoURLs,
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

	p, err := h.products.Create(r.Context(), saveIn)
	if err != nil {
		h.logger.Error("create product", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal simpan (slug mungkin duplikat)")
		return
	}
	response.JSON(w, http.StatusCreated, map[string]any{"product": toProductDTO(p)})
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
	response.JSON(w, http.StatusOK, map[string]any{"product": toProductDTO(p)})
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
