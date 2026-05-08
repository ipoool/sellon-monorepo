package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

type StorefrontHandler struct {
	stores     *repository.StoreRepo
	products   *repository.ProductRepo
	orders     *repository.OrderRepo
	banks      *repository.BankAccountRepo
	categories *repository.CategoryRepo
	logger     *slog.Logger
}

func NewStorefrontHandler(s *repository.StoreRepo, p *repository.ProductRepo, o *repository.OrderRepo, b *repository.BankAccountRepo, c *repository.CategoryRepo, logger *slog.Logger) *StorefrontHandler {
	return &StorefrontHandler{stores: s, products: p, orders: o, banks: b, categories: c, logger: logger}
}

type publicStoreDTO struct {
	ID             string          `json:"id"`
	Slug           string          `json:"slug"`
	Name           string          `json:"name"`
	Description    string          `json:"description"`
	LogoURL        string          `json:"logo_url"`
	Category       string          `json:"category"`
	City           string          `json:"city"`
	WhatsAppNumber string          `json:"whatsapp_number"`
	Instagram      string          `json:"instagram"`
	TikTok         string          `json:"tiktok"`
	OpenHours      json.RawMessage `json:"open_hours"`
	IsOpen         bool            `json:"is_open"`
}

type publicProductDTO struct {
	ID          string   `json:"id"`
	CategoryID  string   `json:"category_id"`
	Name        string   `json:"name"`
	Slug        string   `json:"slug"`
	Description string   `json:"description"`
	PriceCents  int64    `json:"price_cents"`
	Stock       int      `json:"stock"`
	PhotoURLs   []string `json:"photo_urls"`
}

type publicCategoryDTO struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

func toPublicStore(s *repository.Store) publicStoreDTO {
	openHours := json.RawMessage(s.OpenHours)
	if len(openHours) == 0 {
		openHours = json.RawMessage("{}")
	}
	return publicStoreDTO{
		ID: s.ID.String(), Slug: s.Slug, Name: s.Name, Description: s.Description,
		LogoURL: s.LogoURL, Category: s.Category, City: s.City,
		WhatsAppNumber: s.WhatsAppNumber, Instagram: s.Instagram, TikTok: s.TikTok,
		OpenHours: openHours, IsOpen: s.IsOpen,
	}
}

func toPublicProduct(p *repository.Product) publicProductDTO {
	categoryID := ""
	if p.CategoryID != nil {
		categoryID = p.CategoryID.String()
	}
	return publicProductDTO{
		ID: p.ID.String(), CategoryID: categoryID,
		Name: p.Name, Slug: p.Slug, Description: p.Description,
		PriceCents: p.PriceCents, Stock: p.Stock, PhotoURLs: p.PhotoURLs,
	}
}

// GET /api/v1/storefront/{slug}
func (h *StorefrontHandler) GetStore(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	store, err := h.stores.FindBySlug(r.Context(), slug)
	if errors.Is(err, repository.ErrStoreNotFound) {
		response.Error(w, http.StatusNotFound, "toko tidak ditemukan")
		return
	}
	if err != nil {
		h.logger.Error("storefront get store", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	prods, err := h.products.ListActiveByStore(r.Context(), store.ID)
	if err != nil {
		h.logger.Error("storefront list products", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	out := make([]publicProductDTO, 0, len(prods))
	for i := range prods {
		out = append(out, toPublicProduct(&prods[i]))
	}

	cats, _ := h.categories.ListByStore(r.Context(), store.ID)
	catsOut := make([]publicCategoryDTO, 0, len(cats))
	for _, c := range cats {
		catsOut = append(catsOut, publicCategoryDTO{ID: c.ID.String(), Name: c.Name})
	}

	response.JSON(w, http.StatusOK, map[string]any{
		"store":      toPublicStore(store),
		"products":   out,
		"categories": catsOut,
	})
}

// GET /api/v1/storefront/{slug}/products/{productSlug}
func (h *StorefrontHandler) GetProduct(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	productSlug := chi.URLParam(r, "productSlug")

	store, err := h.stores.FindBySlug(r.Context(), slug)
	if errors.Is(err, repository.ErrStoreNotFound) {
		response.Error(w, http.StatusNotFound, "toko tidak ditemukan")
		return
	}
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	p, err := h.products.FindBySlug(r.Context(), store.ID, productSlug)
	if errors.Is(err, repository.ErrProductNotFound) {
		response.Error(w, http.StatusNotFound, "produk tidak ditemukan")
		return
	}
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	if p.Status != "active" {
		response.Error(w, http.StatusNotFound, "produk tidak tersedia")
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{
		"store":   toPublicStore(store),
		"product": toPublicProduct(p),
	})
}

type orderItemReq struct {
	ProductID string `json:"product_id"`
	Quantity  int    `json:"quantity"`
}

type createOrderReq struct {
	CustomerName    string         `json:"customer_name"`
	CustomerWA      string         `json:"customer_whatsapp"`
	CustomerAddress string         `json:"customer_address"`
	CustomerCity    string         `json:"customer_city"`
	Courier         string         `json:"courier"`
	PaymentMethod   string         `json:"payment_method"`
	Notes           string         `json:"notes"`
	ShippingCents   int64          `json:"shipping_cents"`
	Items           []orderItemReq `json:"items"`
}

// POST /api/v1/storefront/{slug}/orders
func (h *StorefrontHandler) CreateOrder(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	store, err := h.stores.FindBySlug(r.Context(), slug)
	if errors.Is(err, repository.ErrStoreNotFound) {
		response.Error(w, http.StatusNotFound, "toko tidak ditemukan")
		return
	}
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	if !store.IsOpen {
		response.Error(w, http.StatusBadRequest, "toko sedang tutup")
		return
	}

	var req createOrderReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	req.CustomerName = strings.TrimSpace(req.CustomerName)
	req.CustomerWA = strings.TrimSpace(req.CustomerWA)
	if req.CustomerName == "" || req.CustomerWA == "" {
		response.Error(w, http.StatusBadRequest, "nama dan nomor WhatsApp wajib")
		return
	}
	if len(req.Items) == 0 {
		response.Error(w, http.StatusBadRequest, "tidak ada produk yang dipesan")
		return
	}

	// Resolve products + validate stock
	items := make([]repository.OrderItemInput, 0, len(req.Items))
	for _, it := range req.Items {
		pid, err := uuid.Parse(it.ProductID)
		if err != nil {
			response.Error(w, http.StatusBadRequest, "product_id invalid")
			return
		}
		if it.Quantity <= 0 {
			response.Error(w, http.StatusBadRequest, "quantity harus > 0")
			return
		}
		p, err := h.products.FindByID(r.Context(), store.ID, pid)
		if err != nil {
			response.Error(w, http.StatusBadRequest, "produk tidak ditemukan")
			return
		}
		if p.Status != "active" {
			response.Error(w, http.StatusBadRequest, "produk "+p.Name+" tidak tersedia")
			return
		}
		if p.Stock < it.Quantity {
			response.Error(w, http.StatusBadRequest, "stok "+p.Name+" tidak cukup")
			return
		}
		items = append(items, repository.OrderItemInput{
			ProductID:   p.ID,
			ProductName: p.Name,
			UnitCents:   p.PriceCents,
			Quantity:    it.Quantity,
		})
	}

	order, err := h.orders.Create(r.Context(), repository.CreateOrderInput{
		StoreID:         store.ID,
		CustomerName:    req.CustomerName,
		CustomerWA:      req.CustomerWA,
		CustomerAddress: req.CustomerAddress,
		CustomerCity:    req.CustomerCity,
		Courier:         req.Courier,
		PaymentMethod:   req.PaymentMethod,
		Notes:           req.Notes,
		ShippingCents:   req.ShippingCents,
		Items:           items,
	})
	if err != nil {
		h.logger.Error("storefront create order", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal membuat pesanan")
		return
	}

	response.JSON(w, http.StatusCreated, map[string]any{
		"order_id":     order.ID.String(),
		"order_number": order.OrderNumber,
		"total_cents":  order.TotalCents,
	})
}

type publicBankDTO struct {
	BankName   string `json:"bank_name"`
	HolderName string `json:"holder_name"`
	AccountNo  string `json:"account_no"`
	IsPrimary  bool   `json:"is_primary"`
	QRISURL    string `json:"qris_url"`
}

// GET /api/v1/storefront/{slug}/orders/{number} — public buyer view
func (h *StorefrontHandler) GetOrder(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	orderNum := chi.URLParam(r, "number")

	store, err := h.stores.FindBySlug(r.Context(), slug)
	if err != nil {
		response.Error(w, http.StatusNotFound, "toko tidak ditemukan")
		return
	}
	order, err := h.orders.FindByOrderNumber(r.Context(), store.ID, orderNum)
	if err != nil {
		response.Error(w, http.StatusNotFound, "pesanan tidak ditemukan")
		return
	}
	items, err := h.orders.ListItems(r.Context(), order.ID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	itemsOut := make([]map[string]any, 0, len(items))
	for _, it := range items {
		itemsOut = append(itemsOut, map[string]any{
			"product_name":      it.ProductName,
			"variant_name":      it.VariantName,
			"unit_price_cents":  it.UnitPriceCents,
			"quantity":          it.Quantity,
			"subtotal_cents":    it.SubtotalCents,
		})
	}

	banks, _ := h.banks.ListByStore(r.Context(), store.ID)
	banksOut := make([]publicBankDTO, 0, len(banks))
	for _, b := range banks {
		banksOut = append(banksOut, publicBankDTO{
			BankName: b.BankName, HolderName: b.HolderName, AccountNo: b.AccountNo,
			IsPrimary: b.IsPrimary, QRISURL: b.QRISURL,
		})
	}

	response.JSON(w, http.StatusOK, map[string]any{
		"store": map[string]any{
			"slug": store.Slug, "name": store.Name,
			"whatsapp_number": store.WhatsAppNumber,
		},
		"order": map[string]any{
			"id":               order.ID.String(),
			"order_number":     order.OrderNumber,
			"status":           order.Status,
			"payment_status":   order.PaymentStatus,
			"payment_method":   order.PaymentMethod,
			"subtotal_cents":   order.SubtotalCents,
			"shipping_cents":   order.ShippingCents,
			"total_cents":      order.TotalCents,
			"courier":          order.Courier,
			"tracking_number":  order.TrackingNumber,
			"customer_name":    order.CustomerName,
			"customer_whatsapp": order.CustomerWhatsApp,
			"customer_address": order.CustomerAddress,
			"customer_city":    order.CustomerCity,
			"payment_url":      order.PaymentURL,
			"created_at":       order.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
			"items":            itemsOut,
		},
		"bank_accounts": banksOut,
	})
}

// POST /api/v1/storefront/{slug}/orders/{number}/mark-paid
// Buyer-triggered: signals that they've paid via manual transfer.
// We move payment_status to 'pending' (under verification by seller).
func (h *StorefrontHandler) MarkPaymentPending(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	orderNum := chi.URLParam(r, "number")

	store, err := h.stores.FindBySlug(r.Context(), slug)
	if err != nil {
		response.Error(w, http.StatusNotFound, "toko tidak ditemukan")
		return
	}
	order, err := h.orders.FindByOrderNumber(r.Context(), store.ID, orderNum)
	if err != nil {
		response.Error(w, http.StatusNotFound, "pesanan tidak ditemukan")
		return
	}
	// Only allow if currently unpaid; idempotent for already-pending.
	if order.PaymentStatus == "paid" {
		response.Error(w, http.StatusBadRequest, "pesanan sudah lunas")
		return
	}
	if err := h.orders.SetPaymentStatus(r.Context(), store.ID, order.ID, "pending", order.PaymentMethod); err != nil {
		h.logger.Error("buyer mark paid", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	response.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}
