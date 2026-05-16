package handler

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/sellon/sellon/api/internal/audit"
	"github.com/sellon/sellon/api/internal/email"
	"github.com/sellon/sellon/api/internal/events"
	"github.com/sellon/sellon/api/internal/notify"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
	"github.com/sellon/sellon/api/internal/shipping"
	"github.com/sellon/sellon/api/internal/shipping/rajaongkir"
	"github.com/sellon/sellon/api/internal/storage"
)

type StorefrontHandler struct {
	stores      *repository.StoreRepo
	products    *repository.ProductRepo
	variants    *repository.VariantRepo
	orders      *repository.OrderRepo
	banks       *repository.BankAccountRepo
	categories  *repository.CategoryRepo
	promos      *repository.PromoRepo
	gateways    *repository.PaymentRepo
	subs        *repository.SubscriptionRepo
	plans       *repository.PlanRepo
	users       *repository.UserRepo
	waTemplates *repository.WATemplateRepo
	broker      *events.Broker
	rajaongkir  *rajaongkir.Client
	mailer      *email.Mailer
	twilio      *notify.Twilio
	storage     *storage.SupabaseClient
	auditLog    *audit.Logger
	webOrigin   string
	logger      *slog.Logger
}

func NewStorefrontHandler(
	s *repository.StoreRepo, p *repository.ProductRepo, v *repository.VariantRepo,
	o *repository.OrderRepo, b *repository.BankAccountRepo, c *repository.CategoryRepo,
	pr *repository.PromoRepo, gw *repository.PaymentRepo,
	subs *repository.SubscriptionRepo,
	plans *repository.PlanRepo,
	users *repository.UserRepo,
	waTemplates *repository.WATemplateRepo,
	broker *events.Broker,
	rk *rajaongkir.Client,
	mailer *email.Mailer,
	twilio *notify.Twilio,
	storageCli *storage.SupabaseClient,
	auditLog *audit.Logger,
	webOrigin string,
	logger *slog.Logger,
) *StorefrontHandler {
	return &StorefrontHandler{
		stores: s, products: p, variants: v, orders: o, banks: b,
		categories:  c, promos: pr, gateways: gw, subs: subs,
		plans:       plans,
		users:       users,
		waTemplates: waTemplates,
		broker:      broker, rajaongkir: rk,
		mailer: mailer, twilio: twilio,
		storage:  storageCli,
		auditLog: auditLog, webOrigin: webOrigin,
		logger: logger,
	}
}

// publicPaymentDTO summarizes what the buyer can pay with — used by the
// checkout form to render only the methods the seller has actually
// configured in Pengaturan → Pembayaran.
type publicPaymentDTO struct {
	HasMidtrans     bool     `json:"has_midtrans"`
	MidtransMethods []string `json:"midtrans_methods"` // qris, bank_transfer, gopay, etc.
	HasManualBank   bool     `json:"has_manual_bank"`
	HasQrisStatic   bool     `json:"has_qris_static"`
	BankCount       int      `json:"bank_count"`
}

// publicShippingDTO summarizes courier whitelist + free-ongkir threshold
// so the checkout form can hint these to the buyer.
type publicShippingDTO struct {
	EnabledCouriers            []string `json:"enabled_couriers"`
	FreeShippingThresholdCents int64    `json:"free_shipping_threshold_cents"`
}

func (h *StorefrontHandler) buildPaymentDTO(ctx context.Context, storeID uuid.UUID) publicPaymentDTO {
	out := publicPaymentDTO{}
	if gw, err := h.gateways.Get(ctx, storeID, "midtrans"); err == nil && gw != nil {
		out.HasMidtrans = len(gw.ServerKeySandboxEncrypted) > 0 || len(gw.ServerKeyProdEncrypted) > 0
		out.MidtransMethods = append(out.MidtransMethods, gw.EnabledMethods...)
	}
	banks, _ := h.banks.ListByStore(ctx, storeID)
	for _, b := range banks {
		if b.AccountNo != "" || b.BankName != "" {
			out.HasManualBank = true
			out.BankCount++
		}
		if b.QRISURL != "" {
			out.HasQrisStatic = true
		}
	}
	if out.MidtransMethods == nil {
		out.MidtransMethods = []string{}
	}
	return out
}

func (h *StorefrontHandler) buildShippingDTO(s *repository.Store) publicShippingDTO {
	couriers := s.EnabledCouriers
	if couriers == nil {
		couriers = []string{}
	}
	return publicShippingDTO{
		EnabledCouriers:            couriers,
		FreeShippingThresholdCents: s.FreeShippingThresholdCents,
	}
}

type publicStoreDTO struct {
	ID               string          `json:"id"`
	Slug             string          `json:"slug"`
	Name             string          `json:"name"`
	Description      string          `json:"description"`
	LogoURL          string          `json:"logo_url"`
	BannerURL        string          `json:"banner_url"`
	Tagline          string          `json:"tagline"`
	Category         string          `json:"category"`
	City             string          `json:"city"`
	WhatsAppNumber   string          `json:"whatsapp_number"`
	Instagram        string          `json:"instagram"`
	TikTok           string          `json:"tiktok"`
	OpenHours        json.RawMessage `json:"open_hours"`
	IsOpen           bool            `json:"is_open"`
	ThemeHue         int             `json:"theme_hue"`
	ProductLayout    string          `json:"product_layout"`
	ShowHoursPublic  bool            `json:"show_hours_public"`
	ShowSocialPublic bool            `json:"show_social_public"`
	FooterText       string          `json:"footer_text"`
	// AcceptingOrders is the buyer-facing "can I order?" gate. False when
	// the seller has the store toggled closed OR has hit the monthly order
	// quota for their tier. Reason carries a stable token the UI keys on:
	// "store_closed" | "order_limit" | "" (when accepting).
	AcceptingOrders       bool            `json:"accepting_orders"`
	AcceptingOrdersReason string          `json:"accepting_orders_reason"`
	LayoutConfig          json.RawMessage `json:"layout_config,omitempty"`
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
	IsFeatured  bool     `json:"is_featured"`
	HasVariants bool     `json:"has_variants"`
	ProductType string   `json:"product_type"` // "physical" | "digital"
}

type publicCategoryDTO struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type publicVariantDTO struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	PriceCents int64  `json:"price_cents"`
	Stock      int    `json:"stock"`
}

func toPublicStore(s *repository.Store) publicStoreDTO {
	openHours := json.RawMessage(s.OpenHours)
	if len(openHours) == 0 {
		openHours = json.RawMessage("{}")
	}
	return publicStoreDTO{
		ID: s.ID.String(), Slug: s.Slug, Name: s.Name, Description: s.Description,
		LogoURL: s.LogoURL, BannerURL: s.BannerURL, Tagline: s.Tagline,
		Category: s.Category, City: s.City,
		WhatsAppNumber: s.WhatsAppNumber, Instagram: s.Instagram, TikTok: s.TikTok,
		OpenHours: openHours, IsOpen: s.IsOpen,
		ThemeHue:         s.ThemeHue,
		ProductLayout:    s.ProductLayout,
		ShowHoursPublic:  s.ShowHoursPublic,
		ShowSocialPublic: s.ShowSocialPublic,
		FooterText:       s.FooterText,
		// AcceptingOrders/Reason default to "open"; callers that have a
		// request context override these with the real check.
		AcceptingOrders:       s.IsOpen,
		AcceptingOrdersReason: "",
		LayoutConfig:          json.RawMessage(s.LayoutConfig),
	}
}

// acceptingOrdersStatus mirrors the gate inside CreateOrder: the seller's
// manual is_open toggle, plus the monthly order quota for their tier. Reads
// fail open so a transient subscription/count error never accidentally
// blocks a buyer who could have placed an order.
func (h *StorefrontHandler) acceptingOrdersStatus(
	ctx context.Context, store *repository.Store,
) (bool, string) {
	// store.IsOpen tidak lagi memblok ordering. Banner di UI yang
	// menginformasikan ke pembeli bahwa pesanan akan diproses saat
	// toko buka kembali — backend tetap accept agar pembeli tidak
	// kehilangan momentum.
	sub, err := h.subs.GetOrCreate(ctx, store.ID)
	if err != nil {
		return true, ""
	}
	limit := orderLimitForSub(sub)
	if limit <= 0 {
		return true, ""
	}
	over, err := h.orders.HasOrdersThisMonthAtLeast(ctx, store.ID, limit)
	if err != nil {
		return true, ""
	}
	if over {
		return false, "order_limit"
	}
	return true, ""
}

// newOrderAlertTemplateKey is the slot in `whatsapp_templates` that
// holds the per-store custom body for the seller-facing new-order
// alert. Missing or empty body → defaultNewOrderAlertTemplate kicks in.
const newOrderAlertTemplateKey = "new_order_alert"

const defaultNewOrderAlertTemplate = "" +
	"🛒 *Pesanan baru!*\n" +
	"\n" +
	"No: *{{order_number}}*\n" +
	"Dari: {{customer_name}} ({{customer_whatsapp}})\n" +
	"Total: *Rp {{total}}*\n" +
	"Metode bayar: {{payment_method}}\n" +
	"\n" +
	"Lihat detail: {{order_link}}"

// sendNewOrderAlert fires off the seller-facing WA alert in a goroutine.
// Bails silently when:
//   - the platform Twilio creds aren't configured (dev / staging), or
//   - the seller is on the free tier (gated feature — see below), or
//   - the store didn't set a notification number.
//
// Free-tier gate: outbound WA notifications are a paid-tier benefit
// because Twilio bills the platform ~Rp 400/pesan. Frontend hides the
// switch for free sellers, but this server-side check is the actual
// guard — a free seller cannot bypass by editing the store row
// directly. Any failure logs at WARN — order creation always succeeds
// regardless.
func (h *StorefrontHandler) sendNewOrderAlert(ctx context.Context, store *repository.Store, order *repository.Order) {
	if h.twilio == nil || !h.twilio.Configured() {
		return
	}
	to := strings.TrimSpace(store.NotificationWhatsAppNumber)
	if to == "" {
		return
	}
	// Plan gate: only Pro and Bisnis get outbound WA alerts.
	sub, err := h.subs.GetOrCreate(ctx, store.ID)
	if err != nil || sub == nil || (sub.Plan != "pro" && sub.Plan != "bisnis") {
		return
	}

	// Pick up the seller's custom template if they've set one, else use
	// the platform default. Template lookup must not block the response
	// — we read inline because the read is cheap (single indexed row)
	// and we already have the request context.
	body := defaultNewOrderAlertTemplate
	if h.waTemplates != nil {
		if tmpls, err := h.waTemplates.ListByStore(ctx, store.ID); err == nil {
			if custom, ok := tmpls[newOrderAlertTemplateKey]; ok && strings.TrimSpace(custom) != "" {
				body = custom
			}
		}
	}

	orderLink := strings.TrimRight(h.webOrigin, "/") + "/orders/" + order.ID.String()
	rendered := renderOrderAlert(body, store, order, orderLink)

	h.twilio.FireAndForget(to, rendered)
}

// renderOrderAlert substitutes the supported template variables into
// `body`. Keeping this as a plain string-replace (not text/template)
// because the variable set is small + fixed and sellers paste these
// into a Pengaturan form — `{{` is far less likely to collide with
// Indonesian copy than Go template syntax.
func renderOrderAlert(body string, store *repository.Store, order *repository.Order, orderLink string) string {
	replacements := []string{
		"{{order_number}}", order.OrderNumber,
		"{{customer_name}}", order.CustomerName,
		"{{customer_whatsapp}}", order.CustomerWhatsApp,
		"{{customer_email}}", order.CustomerEmail,
		"{{customer_city}}", order.CustomerCity,
		"{{total}}", formatRupiahPlain(order.TotalCents),
		"{{subtotal}}", formatRupiahPlain(order.SubtotalCents),
		"{{shipping}}", formatRupiahPlain(order.ShippingCents),
		"{{payment_method}}", paymentMethodLabel(order.PaymentMethod),
		"{{store_name}}", store.Name,
		"{{order_link}}", orderLink,
	}
	return strings.NewReplacer(replacements...).Replace(body)
}

// formatRupiahPlain renders cents as "1.234.567" (no "Rp" prefix, no
// decimals). Keeps templates flexible — the template body controls
// whether "Rp " appears before the number.
func formatRupiahPlain(cents int64) string {
	rupiah := cents / 100
	if rupiah < 0 {
		return "-" + formatRupiahPlain(-cents)
	}
	s := strconv.FormatInt(rupiah, 10)
	// Insert thousands separators (Indonesian convention = dot).
	n := len(s)
	if n <= 3 {
		return s
	}
	out := make([]byte, 0, n+(n-1)/3)
	first := n % 3
	if first > 0 {
		out = append(out, s[:first]...)
		if n > first {
			out = append(out, '.')
		}
	}
	for i := first; i < n; i += 3 {
		out = append(out, s[i:i+3]...)
		if i+3 < n {
			out = append(out, '.')
		}
	}
	return string(out)
}

// paymentMethodLabel maps internal codes to human Indonesian for the
// WA template. Unknown codes pass through unchanged.
func paymentMethodLabel(code string) string {
	switch code {
	case "midtrans":
		return "Midtrans"
	case "manual_transfer", "bank_transfer":
		return "Transfer manual"
	case "qris":
		return "QRIS"
	case "cod":
		return "Bayar di tempat (COD)"
	case "":
		return "Belum dipilih"
	default:
		return code
	}
}

func toPublicProduct(p *repository.Product) publicProductDTO {
	categoryID := ""
	if p.CategoryID != nil {
		categoryID = p.CategoryID.String()
	}
	productType := p.ProductType
	if productType == "" {
		productType = "physical"
	}
	return publicProductDTO{
		ID: p.ID.String(), CategoryID: categoryID,
		Name: p.Name, Slug: p.Slug, Description: p.Description,
		PriceCents: p.PriceCents, Stock: p.Stock, PhotoURLs: p.PhotoURLs,
		IsFeatured: p.IsFeatured, HasVariants: p.HasVariants,
		ProductType: productType,
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

	storeDTO := toPublicStore(store)
	storeDTO.AcceptingOrders, storeDTO.AcceptingOrdersReason =
		h.acceptingOrdersStatus(r.Context(), store)

	response.JSON(w, http.StatusOK, map[string]any{
		"store":      storeDTO,
		"products":   out,
		"categories": catsOut,
		"payment":    h.buildPaymentDTO(r.Context(), store.ID),
		"shipping":   h.buildShippingDTO(store),
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

	vRows, _ := h.variants.ListByProduct(r.Context(), p.ID)
	vOut := make([]publicVariantDTO, 0, len(vRows))
	for _, v := range vRows {
		vOut = append(vOut, publicVariantDTO{
			ID: v.ID.String(), Name: v.Name,
			PriceCents: v.PriceCents, Stock: v.Stock,
		})
	}

	storeDTO := toPublicStore(store)
	storeDTO.AcceptingOrders, storeDTO.AcceptingOrdersReason =
		h.acceptingOrdersStatus(r.Context(), store)

	response.JSON(w, http.StatusOK, map[string]any{
		"store":    storeDTO,
		"product":  toPublicProduct(p),
		"variants": vOut,
		"payment":  h.buildPaymentDTO(r.Context(), store.ID),
		"shipping": h.buildShippingDTO(store),
	})
}

type orderItemReq struct {
	ProductID string `json:"product_id"`
	VariantID string `json:"variant_id"`
	Quantity  int    `json:"quantity"`
}

type createOrderReq struct {
	CustomerName    string         `json:"customer_name"`
	CustomerWA      string         `json:"customer_whatsapp"`
	CustomerEmail   string         `json:"customer_email"`
	CustomerAddress string         `json:"customer_address"`
	CustomerCity    string         `json:"customer_city"`
	Courier         string         `json:"courier"`
	PaymentMethod   string         `json:"payment_method"`
	Notes           string         `json:"notes"`
	ShippingCents   int64          `json:"shipping_cents"`
	PromoCode       string         `json:"promo_code"`
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
	// Note: store.IsOpen TIDAK lagi block order creation. Pembeli tetap
	// boleh order saat toko tutup — pesanan masuk antrian dan diproses
	// seller setelah buka. UI menampilkan banner informatif sebagai
	// pengganti hard-block. Quota check di bawah tetap berlaku.

	// Tier order-quota: free=50/month, pro/bisnis=unlimited. Fail-open if
	// the subscription read errors so a transient DB hiccup doesn't block
	// buyer checkout.
	if sub, err := h.subs.GetOrCreate(r.Context(), store.ID); err == nil {
		if limit := orderLimitForSub(sub); limit > 0 {
			if over, err := h.orders.HasOrdersThisMonthAtLeast(r.Context(), store.ID, limit); err == nil && over {
				response.Error(w, http.StatusServiceUnavailable,
					"Penjual sementara tidak menerima pesanan baru. Silakan hubungi langsung admin toko untuk pemesanan.")
				return
			}
		}
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

		// If product has variants, variant_id is required and price/stock
		// come from the variant. Otherwise fall back to product fields.
		unitCents := p.PriceCents
		productName := p.Name
		variantName := ""
		var variantID *uuid.UUID
		stock := p.Stock

		if p.HasVariants {
			if it.VariantID == "" {
				response.Error(w, http.StatusBadRequest,
					"produk "+p.Name+" punya varian — pilih varian dulu")
				return
			}
			vid, err := uuid.Parse(it.VariantID)
			if err != nil {
				response.Error(w, http.StatusBadRequest, "variant_id invalid")
				return
			}
			variant, err := h.variants.FindByID(r.Context(), vid)
			if err != nil || variant.ProductID != p.ID {
				response.Error(w, http.StatusBadRequest, "varian tidak ditemukan")
				return
			}
			unitCents = variant.PriceCents
			variantName = variant.Name
			variantID = &variant.ID
			stock = variant.Stock
		}

		// Digital products have no real inventory — bytes don't run out.
		// Skipping the check so a seller who forgets to set stock on an
		// ebook/voucher product doesn't end up with a silently-broken
		// store (BUG-020).
		if p.ProductType != "digital" && stock < it.Quantity {
			response.Error(w, http.StatusBadRequest,
				"stok "+productName+" tidak cukup")
			return
		}
		items = append(items, repository.OrderItemInput{
			ProductID:   p.ID,
			VariantID:   variantID,
			ProductName: productName,
			VariantName: variantName,
			UnitCents:   unitCents,
			Quantity:    it.Quantity,
			ProductType: p.ProductType,
		})
	}

	// Resolve promo (if any). We re-validate server-side rather than trusting
	// the client's discount calculation.
	var (
		promoID       *uuid.UUID
		promoCode     string
		discountCents int64
		shippingCents = req.ShippingCents
	)
	if code := strings.TrimSpace(req.PromoCode); code != "" {
		var subtotal int64
		for _, it := range items {
			subtotal += it.UnitCents * int64(it.Quantity)
		}
		promo, err := h.promos.FindByCode(r.Context(), store.ID, code)
		if err != nil {
			response.Error(w, http.StatusBadRequest, "kode promo tidak ditemukan")
			return
		}
		if err := promo.CheckActive(time.Now()); err != nil {
			response.Error(w, http.StatusBadRequest, err.Error())
			return
		}
		if promo.MinPurchaseCents > 0 && subtotal < promo.MinPurchaseCents {
			response.Error(w, http.StatusBadRequest,
				"minimum belanja kode promo belum terpenuhi")
			return
		}
		d, freeShipping := promo.ComputeDiscount(subtotal, shippingCents)
		discountCents = d
		if freeShipping {
			shippingCents = 0
		}
		promoCode = promo.Code
		pid := promo.ID
		promoID = &pid
	}

	// Cart-level digital detection. If every item is digital, we know
	// to skip address / shipping requirements and trigger fulfillment
	// path on payment-paid. Mixed carts (1 digital + 1 physical) are
	// treated as physical for shipping purposes — seller still ships
	// the physical item; the digital one gets its own download link.
	allDigital := len(items) > 0
	for _, it := range items {
		if it.ProductType != "digital" {
			allDigital = false
			break
		}
	}
	if allDigital {
		// Sanity-check: digital orders should not be billed shipping.
		shippingCents = 0
	}

	if allDigital && strings.TrimSpace(req.CustomerEmail) == "" {
		response.Error(w, http.StatusBadRequest,
			"email pembeli wajib diisi untuk produk digital — link download dikirim ke sini")
		return
	}

	order, err := h.orders.Create(r.Context(), repository.CreateOrderInput{
		StoreID:         store.ID,
		CustomerName:    req.CustomerName,
		CustomerWA:      req.CustomerWA,
		CustomerEmail:   strings.TrimSpace(req.CustomerEmail),
		CustomerAddress: req.CustomerAddress,
		CustomerCity:    req.CustomerCity,
		Courier:         req.Courier,
		PaymentMethod:   req.PaymentMethod,
		Notes:           req.Notes,
		ShippingCents:   shippingCents,
		DiscountCents:   discountCents,
		PromoCode:       promoCode,
		PromoID:         promoID,
		Items:           items,
	})
	if err != nil {
		// Concurrency: another buyer just bought the last unit between our
		// pre-check and the decrement. Surface a friendly message so the
		// buyer knows the issue is transient.
		if errors.Is(err, repository.ErrStockInsufficient) {
			response.Error(w, http.StatusConflict,
				"stok barusan habis — silakan refresh dan coba lagi")
			return
		}
		h.logger.Error("storefront create order", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal membuat pesanan")
		return
	}

	// Bump promo usage AFTER the order is committed. Failure to bump shouldn't
	// fail the order — log and move on.
	if promoID != nil {
		if err := h.promos.IncrementUsage(r.Context(), *promoID); err != nil {
			h.logger.Error("increment promo usage", "err", err, "promo_id", promoID.String())
		}
	}

	// Push to dashboard SSE subscribers so the seller sees the order
	// without refreshing.
	if h.broker != nil {
		h.broker.Publish(store.ID, events.Event{
			Type: "order.created",
			Payload: map[string]any{
				"order_id":      order.ID.String(),
				"order_number":  order.OrderNumber,
				"customer_name": order.CustomerName,
				"total_cents":   order.TotalCents,
				"created_at":    order.CreatedAt.Format(time.RFC3339),
			},
		})
	}

	// Outbound WhatsApp alert to the seller's notification number, if
	// they've configured one + Twilio is wired on the platform. Runs in
	// a goroutine — never block the buyer's checkout on Twilio.
	h.sendNewOrderAlert(r.Context(), store, order)

	// Audit: log every buyer-side order creation. Buyer is anonymous
	// (no auth), so the audit Logger records empty actor — UI surfaces
	// it as "Pelanggan" / "Sistem".
	h.auditLog.Log(r.Context(), store.ID, audit.Event{
		Action:     "order.created",
		EntityType: "order",
		EntityID:   order.ID.String(),
		Summary:    "Pesanan baru #" + order.OrderNumber + " dari " + order.CustomerName,
		Metadata: map[string]any{
			"order_number":   order.OrderNumber,
			"customer_name":  order.CustomerName,
			"customer_wa":    order.CustomerWhatsApp,
			"total_cents":    order.TotalCents,
			"payment_method": order.PaymentMethod,
			"channel":        "storefront",
		},
	})

	// Email the seller. Best-effort — already runs in a goroutine
	// inside the mailer. Built from a fresh background context so a
	// disconnected buyer doesn't cancel the lookup.
	go h.emailNewOrderToSeller(store, order, items)

	response.JSON(w, http.StatusCreated, map[string]any{
		"order_id":     order.ID.String(),
		"order_number": order.OrderNumber,
		"total_cents":  order.TotalCents,
	})
}

// emailNewOrderToSeller looks up the store owner's email and dispatches
// the "new order" notification. Runs detached from the request to keep
// the buyer's checkout fast and resilient.
func (h *StorefrontHandler) emailNewOrderToSeller(
	store *repository.Store,
	order *repository.Order,
	items []repository.OrderItemInput,
) {
	if !h.mailer.Configured() || h.users == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	owner, err := h.users.FindByID(ctx, store.OwnerID)
	if err != nil || owner == nil || owner.Email == "" {
		return
	}

	// One-line-per-item summary: "2× Kaos M (Hitam) — Rp 200.000".
	var sb strings.Builder
	for _, it := range items {
		name := it.ProductName
		if it.VariantName != "" {
			name += " (" + it.VariantName + ")"
		}
		fmtLine(&sb, it.Quantity, name, it.UnitCents*int64(it.Quantity))
	}

	dashURL := strings.TrimRight(h.webOrigin, "/") + "/dashboard/orders"

	subject, text, htmlBody := email.RenderNewOrder(email.NewOrderData{
		StoreName:         store.Name,
		OrderNumber:       order.OrderNumber,
		CustomerName:      order.CustomerName,
		CustomerWA:        order.CustomerWhatsApp,
		TotalCents:        order.TotalCents,
		ItemSummary:       sb.String(),
		PaymentMethod:     order.PaymentMethod,
		OrderDashboardURL: dashURL,
	})
	h.mailer.Send(email.Message{
		To:       owner.Email,
		ToName:   owner.Name,
		Subject:  subject,
		Text:     text,
		HTML:     htmlBody,
		Category: "order_created",
	})
}

func fmtLine(sb *strings.Builder, qty int, name string, total int64) {
	// Compact: "2× Kaos M — Rp 200.000\n"
	rupiahStr := email.RenderRupiah(total)
	if sb.Len() > 0 {
		sb.WriteByte('\n')
	}
	if qty <= 0 {
		qty = 1
	}
	sb.WriteString(itoa(qty))
	sb.WriteString("× ")
	sb.WriteString(name)
	sb.WriteString(" — ")
	sb.WriteString(rupiahStr)
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var buf [12]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}

// POST /api/v1/storefront/{slug}/promos/validate — buyer-entered code check.
type validatePromoReq struct {
	Code          string `json:"code"`
	SubtotalCents int64  `json:"subtotal_cents"`
	ShippingCents int64  `json:"shipping_cents"`
}

func (h *StorefrontHandler) ValidatePromo(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	store, err := h.stores.FindBySlug(r.Context(), slug)
	if err != nil {
		response.Error(w, http.StatusNotFound, "toko tidak ditemukan")
		return
	}
	var req validatePromoReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	code := strings.TrimSpace(req.Code)
	if code == "" {
		response.Error(w, http.StatusBadRequest, "kode wajib diisi")
		return
	}
	promo, err := h.promos.FindByCode(r.Context(), store.ID, code)
	if err != nil {
		response.Error(w, http.StatusNotFound, "kode promo tidak ditemukan")
		return
	}
	if err := promo.CheckActive(time.Now()); err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	if promo.MinPurchaseCents > 0 && req.SubtotalCents < promo.MinPurchaseCents {
		response.Error(w, http.StatusBadRequest,
			"minimum belanja belum terpenuhi untuk pakai kode ini")
		return
	}
	discount, freeShipping := promo.ComputeDiscount(req.SubtotalCents, req.ShippingCents)
	response.JSON(w, http.StatusOK, map[string]any{
		"code":               promo.Code,
		"type":               string(promo.Type),
		"discount_cents":     discount,
		"free_shipping":      freeShipping,
		"min_purchase_cents": promo.MinPurchaseCents,
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
			"id":                 order.ID.String(),
			"order_number":       order.OrderNumber,
			"status":             order.Status,
			"payment_status":     order.PaymentStatus,
			"payment_method":     order.PaymentMethod,
			"subtotal_cents":     order.SubtotalCents,
			"shipping_cents":     order.ShippingCents,
			"discount_cents":     order.DiscountCents,
			"promo_code":         order.PromoCode,
			"total_cents":        order.TotalCents,
			"courier":            order.Courier,
			"tracking_number":    order.TrackingNumber,
			"customer_name":      order.CustomerName,
			"customer_whatsapp":  order.CustomerWhatsApp,
			"customer_address":   order.CustomerAddress,
			"customer_city":      order.CustomerCity,
			"payment_url":        order.PaymentURL,
			"payment_proof_url":  order.PaymentProofURL,
			"payment_proof_note": order.PaymentProofNote,
			"created_at":         order.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
			"items":              itemsOut,
		},
		"bank_accounts": banksOut,
	})
}

type shippingQuoteItem struct {
	ProductID string `json:"product_id"`
	Quantity  int    `json:"quantity"`
}

type shippingQuoteReq struct {
	City   string              `json:"city"`
	CityID string              `json:"city_id"` // RajaOngkir destination city_id
	Items  []shippingQuoteItem `json:"items"`
}

// POST /api/v1/storefront/{slug}/shipping/quote
//
// Public — buyer hits this on the product detail page once they fill in
// their city. Returns a list of available courier options + prices.
func (h *StorefrontHandler) ShippingQuote(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	store, err := h.stores.FindBySlug(r.Context(), slug)
	if err != nil {
		response.Error(w, http.StatusNotFound, "toko tidak ditemukan")
		return
	}

	var req shippingQuoteReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}

	// Sum weights + subtotal from line items (missing weight defaults to 250g).
	totalWeightG := 0
	var subtotalCents int64
	for _, it := range req.Items {
		pid, err := uuid.Parse(it.ProductID)
		if err != nil {
			continue
		}
		p, err := h.products.FindByID(r.Context(), store.ID, pid)
		if err != nil {
			continue
		}
		w := p.WeightG
		if w <= 0 {
			w = 250
		}
		qty := it.Quantity
		if qty < 1 {
			qty = 1
		}
		totalWeightG += w * qty
		subtotalCents += p.PriceCents * int64(qty)
	}
	if totalWeightG == 0 {
		totalWeightG = 250
	}

	originCity := store.ShippingOriginCity
	if originCity == "" {
		originCity = store.City
	}

	var options []shipping.Option

	// Try RajaOngkir first when:
	//  * client is configured (api key present)
	//  * seller has set their origin city_id in Pengaturan Pengiriman
	//  * buyer's request has city_id (not just free-text city)
	if h.rajaongkir != nil && h.rajaongkir.IsConfigured() &&
		store.ShippingOriginCityID != "" && req.CityID != "" {
		// Allowed couriers: intersection of seller whitelist and what
		// RajaOngkir starter supports (jne/tiki/pos). When the seller has
		// no whitelist, query all three.
		want := []string{"jne", "tiki", "pos"}
		if len(store.EnabledCouriers) > 0 {
			allowed := map[string]bool{}
			for _, c := range store.EnabledCouriers {
				allowed[strings.ToLower(c)] = true
			}
			filtered := want[:0]
			for _, c := range want {
				if allowed[c] {
					filtered = append(filtered, c)
				}
			}
			want = filtered
		}
		for _, code := range want {
			res, err := h.rajaongkir.Cost(r.Context(), rajaongkir.CostRequest{
				Origin:      store.ShippingOriginCityID,
				Destination: req.CityID,
				WeightG:     totalWeightG,
				Courier:     code,
			})
			if err != nil {
				h.logger.Warn("rajaongkir cost", "err", err, "courier", code)
				continue
			}
			for _, opt := range res {
				options = append(options, shipping.Option{
					Courier:   opt.CourierName,
					Code:      opt.CourierCode,
					Service:   opt.Service,
					PriceRpah: opt.PriceRpah,
					ETA:       opt.ETA + " hari",
					Zone:      "rajaongkir",
				})
			}
		}
	}

	// Fallback to the built-in zone-based table if RajaOngkir didn't return
	// usable rows (no API key, no city IDs, or upstream error).
	if len(options) == 0 {
		options = shipping.QuoteOptions(req.City, originCity, totalWeightG)
	}

	// Filter to seller-enabled couriers (empty whitelist = all allowed).
	if len(store.EnabledCouriers) > 0 {
		allowed := map[string]bool{}
		for _, c := range store.EnabledCouriers {
			allowed[c] = true
		}
		filtered := options[:0]
		for _, o := range options {
			if allowed[o.Code] {
				filtered = append(filtered, o)
			}
		}
		options = filtered
	}

	// Apply free-shipping threshold: if subtotal qualifies, override every
	// option's price to 0 and tag the response so the UI can surface it.
	freeShipping := store.FreeShippingThresholdCents > 0 &&
		subtotalCents >= store.FreeShippingThresholdCents
	if freeShipping {
		for i := range options {
			options[i].PriceRpah = 0
		}
	}

	response.JSON(w, http.StatusOK, map[string]any{
		"options":                       options,
		"total_weight_g":                totalWeightG,
		"buyer_city":                    req.City,
		"seller_city":                   originCity,
		"free_shipping":                 freeShipping,
		"free_shipping_threshold_cents": store.FreeShippingThresholdCents,
	})
}

// POST /api/v1/storefront/{slug}/orders/{number}/payment-proof
//
// Buyer upload bukti transfer (image) + catatan opsional. Endpoint
// public — auth via {slug}+{number}. Setelah upload, payment_status
// otomatis move ke "pending" supaya seller dapat sinyal verifikasi
// di dashboard.
//
// Multipart: field "file" (image jpg/png/webp) + "note" (text opsional).
// File disimpan di Supabase: stores/{store_id}/payment_proofs/{stamp}.ext
func (h *StorefrontHandler) UploadPaymentProof(w http.ResponseWriter, r *http.Request) {
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
	if order.PaymentStatus == "paid" {
		response.Error(w, http.StatusBadRequest, "pesanan sudah lunas — tidak perlu kirim bukti lagi")
		return
	}
	// One-shot guard: kalau bukti sudah pernah di-upload sebelumnya,
	// tolak upload baru. Mencegah pihak jahil yang tahu URL endpoint
	// (slug + order_number publik) spam-overwrite bukti yang sah.
	// Kalau ternyata pembeli mau ganti bukti (mis. salah upload),
	// minta lewat WhatsApp ke penjual — penjual bisa reset proof
	// dari dashboard di future iteration.
	if order.PaymentProofURL != "" {
		response.Error(w, http.StatusConflict,
			"Bukti transfer sudah pernah dikirim untuk pesanan ini. Kalau ada masalah, hubungi penjual lewat WhatsApp.")
		return
	}
	if h.storage == nil || !h.storage.IsConfigured() {
		response.Error(w, http.StatusServiceUnavailable, "upload belum dikonfigurasi di server")
		return
	}

	// 10 MB cap — cukup untuk screenshot transfer dari HP modern.
	r.Body = http.MaxBytesReader(w, r.Body, 10*1024*1024)
	if err := r.ParseMultipartForm(10 * 1024 * 1024); err != nil {
		response.Error(w, http.StatusBadRequest, "file terlalu besar (maks 10 MB)")
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		response.Error(w, http.StatusBadRequest, "field 'file' wajib")
		return
	}
	defer file.Close()

	contentType := header.Header.Get("Content-Type")
	switch contentType {
	case "image/jpeg", "image/png", "image/webp":
		// ok
	default:
		response.Error(w, http.StatusBadRequest, "format harus JPG / PNG / WebP")
		return
	}

	body, err := io.ReadAll(file)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "gagal baca file")
		return
	}

	ext := "jpg"
	switch contentType {
	case "image/png":
		ext = "png"
	case "image/webp":
		ext = "webp"
	}
	key, err := storage.RandomKey(store.ID.String()+"/payment_proofs/"+order.ID.String(), ext)
	if err != nil {
		h.logger.Error("random key", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	res, err := h.storage.Upload(r.Context(), key, contentType, body)
	if err != nil {
		h.logger.Error("supabase upload payment proof", "err", err, "order", order.ID)
		response.Error(w, http.StatusBadGateway, "gagal upload bukti")
		return
	}

	note := strings.TrimSpace(r.FormValue("note"))
	if err := h.orders.SetPaymentProof(r.Context(), order.ID, res.PublicURL, note); err != nil {
		h.logger.Error("set payment proof", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Auto-mark sebagai pending kalau masih unpaid agar seller punya
	// trigger di dashboard untuk verifikasi.
	if order.PaymentStatus == "unpaid" {
		_ = h.orders.SetPaymentStatus(r.Context(), store.ID, order.ID, "pending", order.PaymentMethod)
	}

	// Audit + notify seller via broker (SSE) supaya badge order baru
	// nyala kalau seller lagi buka dashboard.
	h.auditLog.Log(r.Context(), store.ID, audit.Event{
		Action:     "order.payment_proof_uploaded",
		EntityType: "order",
		EntityID:   order.ID.String(),
		Summary:    "Pembeli kirim bukti transfer untuk #" + order.OrderNumber,
		Metadata: map[string]any{
			"order_number": order.OrderNumber,
			"proof_url":    res.PublicURL,
			"has_note":     note != "",
		},
	})

	response.JSON(w, http.StatusOK, map[string]any{
		"ok":         true,
		"proof_url":  res.PublicURL,
		"proof_note": note,
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

// GET /api/v1/storefront/domain-lookup?host=toko.brand.com
// Public — called by Next.js middleware to resolve a custom domain to a store slug.
// Returns 404 for unknown or unverified domains to avoid leaking store info.
func (h *StorefrontHandler) DomainLookup(w http.ResponseWriter, r *http.Request) {
	host := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("host")))
	if host == "" {
		response.Error(w, http.StatusBadRequest, "host required")
		return
	}
	// Strip port if present (e.g., "toko.brand.com:443" → "toko.brand.com").
	if i := strings.LastIndex(host, ":"); i > 0 {
		host = host[:i]
	}

	store, err := h.stores.FindByDomain(r.Context(), host)
	if errors.Is(err, repository.ErrStoreNotFound) {
		response.Error(w, http.StatusNotFound, "domain tidak ditemukan")
		return
	}
	if err != nil {
		h.logger.Error("domain lookup", "err", err, "host", host)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	// Only active domains serve traffic; pending/failed return 404.
	if store.DomainStatus != "active" {
		response.Error(w, http.StatusNotFound, "domain belum aktif")
		return
	}
	response.JSON(w, http.StatusOK, map[string]string{"slug": store.Slug})
}
