package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/sellon/sellon/api/internal/audit"
	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

type StoreHandler struct {
	stores *repository.StoreRepo
	subs   *repository.SubscriptionRepo
	audit  *audit.Logger
	logger *slog.Logger
}

func NewStoreHandler(stores *repository.StoreRepo, subs *repository.SubscriptionRepo, audit *audit.Logger, logger *slog.Logger) *StoreHandler {
	return &StoreHandler{stores: stores, subs: subs, audit: audit, logger: logger}
}

type storeDTO struct {
	ID                         string          `json:"id"`
	Slug                       string          `json:"slug"`
	Name                       string          `json:"name"`
	Description                string          `json:"description"`
	LogoURL                    string          `json:"logo_url"`
	BannerURL                  string          `json:"banner_url"`
	Tagline                    string          `json:"tagline"`
	Category                   string          `json:"category"`
	City                       string          `json:"city"`
	WhatsAppNumber             string          `json:"whatsapp_number"`
	NotificationWhatsAppNumber string          `json:"notification_whatsapp_number"`
	Instagram                  string          `json:"instagram"`
	TikTok                     string          `json:"tiktok"`
	OpenHours                  json.RawMessage `json:"open_hours"`
	IsOpen                     bool            `json:"is_open"`
	ShippingOriginCity         string          `json:"shipping_origin_city"`
	ShippingOriginCityID       string          `json:"shipping_origin_city_id"`
	ShippingOriginCityName     string          `json:"shipping_origin_city_name"`
	EnabledCouriers            []string        `json:"enabled_couriers"`
	FreeShippingThresholdCents int64           `json:"free_shipping_threshold_cents"`
	ThemeHue                   int             `json:"theme_hue"`
	ProductLayout              string          `json:"product_layout"`
	ShowHoursPublic            bool            `json:"show_hours_public"`
	ShowSocialPublic           bool            `json:"show_social_public"`
	FooterText                 string          `json:"footer_text"`
	SegmentVipThreshold        int             `json:"segment_vip_threshold"`
	SegmentLoyalThreshold      int             `json:"segment_loyal_threshold"`
	SegmentBaruName            string          `json:"segment_baru_name"`
	SegmentRegulerName         string          `json:"segment_reguler_name"`
	SegmentLoyalName           string          `json:"segment_loyal_name"`
	SegmentVipName             string          `json:"segment_vip_name"`
	CustomDomain               *string         `json:"custom_domain"`
	DomainStatus               string          `json:"domain_status"`
	DomainVerifiedAt           *string         `json:"domain_verified_at"`
}

func toStoreDTO(s *repository.Store) storeDTO {
	openHours := json.RawMessage(s.OpenHours)
	if len(openHours) == 0 {
		openHours = json.RawMessage("{}")
	}
	couriers := s.EnabledCouriers
	if couriers == nil {
		couriers = []string{}
	}
	return storeDTO{
		ID: s.ID.String(), Slug: s.Slug, Name: s.Name, Description: s.Description,
		LogoURL: s.LogoURL, BannerURL: s.BannerURL, Tagline: s.Tagline,
		Category: s.Category, City: s.City,
		WhatsAppNumber: s.WhatsAppNumber,
		NotificationWhatsAppNumber: s.NotificationWhatsAppNumber,
		Instagram: s.Instagram, TikTok: s.TikTok,
		OpenHours: openHours, IsOpen: s.IsOpen,
		ShippingOriginCity:         s.ShippingOriginCity,
		ShippingOriginCityID:       s.ShippingOriginCityID,
		ShippingOriginCityName:     s.ShippingOriginCityName,
		EnabledCouriers:            couriers,
		FreeShippingThresholdCents: s.FreeShippingThresholdCents,
		ThemeHue:                   s.ThemeHue,
		ProductLayout:              s.ProductLayout,
		ShowHoursPublic:            s.ShowHoursPublic,
		ShowSocialPublic:           s.ShowSocialPublic,
		FooterText:                 s.FooterText,
		SegmentVipThreshold:        s.SegmentVipThreshold,
		SegmentLoyalThreshold:      s.SegmentLoyalThreshold,
		SegmentBaruName:            s.SegmentBaruName,
		SegmentRegulerName:         s.SegmentRegulerName,
		SegmentLoyalName:           s.SegmentLoyalName,
		SegmentVipName:    s.SegmentVipName,
		CustomDomain:     s.CustomDomain,
		DomainStatus:     s.DomainStatus,
		DomainVerifiedAt: formatTimePtr(s.DomainVerifiedAt),
	}
}

func formatTimePtr(t *time.Time) *string {
	if t == nil {
		return nil
	}
	v := t.Format(time.RFC3339)
	return &v
}

// GET /api/v1/store
func (h *StoreHandler) Get(w http.ResponseWriter, r *http.Request) {
	uid, _ := auth.UserIDFromContext(r.Context())
	store, err := h.stores.FindByOwnerID(r.Context(), uid)
	if errors.Is(err, repository.ErrStoreNotFound) {
		response.JSON(w, http.StatusOK, map[string]any{"store": nil})
		return
	}
	if err != nil {
		h.logger.Error("get store", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"store": toStoreDTO(store)})
}

type createStoreReq struct {
	Name     string `json:"name"`
	Slug     string `json:"slug"`
	Category string `json:"category"`
	City     string `json:"city"`
}

// POST /api/v1/store — first-time setup
func (h *StoreHandler) Create(w http.ResponseWriter, r *http.Request) {
	uid, _ := auth.UserIDFromContext(r.Context())

	if existing, err := h.stores.FindByOwnerID(r.Context(), uid); err == nil && existing != nil {
		response.Error(w, http.StatusConflict, "store already exists")
		return
	}

	var req createStoreReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	req.Slug = sanitizeSlug(req.Slug)
	if req.Name == "" || req.Slug == "" {
		response.Error(w, http.StatusBadRequest, "nama dan slug wajib")
		return
	}

	store, err := h.stores.Create(r.Context(), repository.CreateStoreInput{
		OwnerID: uid, Slug: req.Slug, Name: req.Name,
		Category: req.Category, City: req.City,
	})
	if err != nil {
		h.logger.Error("create store", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal membuat toko (slug mungkin sudah dipakai)")
		return
	}
	h.audit.Log(r.Context(), store.ID, audit.Event{
		Action:     "store.created",
		EntityType: "store",
		EntityID:   store.ID.String(),
		Summary:    "Toko " + store.Name + " dibuat",
		Metadata: map[string]any{
			"name":     store.Name,
			"slug":     store.Slug,
			"category": store.Category,
			"city":     store.City,
		},
	})
	response.JSON(w, http.StatusCreated, map[string]any{"store": toStoreDTO(store)})
}

type updateStoreReq struct {
	Name                       string          `json:"name"`
	Description                string          `json:"description"`
	LogoURL                    string          `json:"logo_url"`
	BannerURL                  string          `json:"banner_url"`
	Tagline                    string          `json:"tagline"`
	Category                   string          `json:"category"`
	City                       string          `json:"city"`
	WhatsAppNumber             string          `json:"whatsapp_number"`
	NotificationWhatsAppNumber string          `json:"notification_whatsapp_number"`
	Instagram                  string          `json:"instagram"`
	TikTok                     string          `json:"tiktok"`
	OpenHours                  json.RawMessage `json:"open_hours"`
	IsOpen                     bool            `json:"is_open"`
}

// PUT /api/v1/store
func (h *StoreHandler) Update(w http.ResponseWriter, r *http.Request) {
	uid, _ := auth.UserIDFromContext(r.Context())
	existing, err := h.stores.FindByOwnerID(r.Context(), uid)
	if errors.Is(err, repository.ErrStoreNotFound) {
		response.Error(w, http.StatusNotFound, "toko belum dibuat")
		return
	}
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	var req updateStoreReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}

	var openHours []byte
	if len(req.OpenHours) > 0 {
		openHours = []byte(req.OpenHours)
	}
	store, err := h.stores.Update(r.Context(), existing.ID, repository.UpdateStoreInput{
		Name: strings.TrimSpace(req.Name), Description: req.Description, LogoURL: req.LogoURL,
		BannerURL: req.BannerURL, Tagline: strings.TrimSpace(req.Tagline),
		Category: req.Category, City: req.City,
		WhatsAppNumber:             strings.TrimSpace(req.WhatsAppNumber),
		NotificationWhatsAppNumber: strings.TrimSpace(req.NotificationWhatsAppNumber),
		Instagram:                  req.Instagram,
		TikTok:                     req.TikTok,
		OpenHoursJSON:              openHours,
		IsOpen:                     req.IsOpen,
	})
	if err != nil {
		h.logger.Error("update store", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal update toko")
		return
	}
	h.audit.Log(r.Context(), store.ID, audit.Event{
		Action:     "store.updated",
		EntityType: "store",
		EntityID:   store.ID.String(),
		Summary:    "Update profil toko",
		Metadata: map[string]any{
			"is_open":  store.IsOpen,
			"category": store.Category,
			"city":     store.City,
		},
	})
	response.JSON(w, http.StatusOK, map[string]any{"store": toStoreDTO(store)})
}

type updateStorefrontReq struct {
	LogoURL          string `json:"logo_url"`
	BannerURL        string `json:"banner_url"`
	Tagline          string `json:"tagline"`
	ThemeHue         int    `json:"theme_hue"`
	ProductLayout    string `json:"product_layout"`
	ShowHoursPublic  bool   `json:"show_hours_public"`
	ShowSocialPublic bool   `json:"show_social_public"`
	FooterText       string `json:"footer_text"`
}

// PUT /api/v1/store/storefront — narrow updater for the Storefront page.
func (h *StoreHandler) UpdateStorefront(w http.ResponseWriter, r *http.Request) {
	uid, _ := auth.UserIDFromContext(r.Context())
	existing, err := h.stores.FindByOwnerID(r.Context(), uid)
	if errors.Is(err, repository.ErrStoreNotFound) {
		response.Error(w, http.StatusNotFound, "toko belum dibuat")
		return
	}
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	var req updateStorefrontReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	// Theme color + product layout adalah Pro/Bisnis feature. Free
	// sellers keep whatever value is already on the row (don't reset
	// to default — preserves choice yang dipakai sebelum downgrade).
	// Frontend gates the picker; this is the server defense.
	themeHue := req.ThemeHue
	productLayout := req.ProductLayout
	if h.subs != nil {
		if sub, err := h.subs.GetOrCreate(r.Context(), existing.ID); err == nil &&
			sub != nil && sub.Plan != "pro" && sub.Plan != "bisnis" {
			themeHue = existing.ThemeHue
			productLayout = existing.ProductLayout
		}
	}
	store, err := h.stores.UpdateStorefront(r.Context(), existing.ID, repository.UpdateStorefrontInput{
		LogoURL:          req.LogoURL,
		BannerURL:        req.BannerURL,
		Tagline:          strings.TrimSpace(req.Tagline),
		ThemeHue:         themeHue,
		ProductLayout:    productLayout,
		ShowHoursPublic:  req.ShowHoursPublic,
		ShowSocialPublic: req.ShowSocialPublic,
		FooterText:       strings.TrimSpace(req.FooterText),
	})
	if err != nil {
		h.logger.Error("update storefront", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal simpan")
		return
	}
	h.audit.Log(r.Context(), store.ID, audit.Event{
		Action:     "store.storefront_updated",
		EntityType: "store",
		EntityID:   store.ID.String(),
		Summary:    "Update tampilan storefront",
		Metadata: map[string]any{
			"theme_hue":   store.ThemeHue,
			"footer_text": store.FooterText,
		},
	})
	response.JSON(w, http.StatusOK, map[string]any{"store": toStoreDTO(store)})
}

type updateShippingReq struct {
	ShippingOriginCity         string   `json:"shipping_origin_city"`
	ShippingOriginCityID       string   `json:"shipping_origin_city_id"`
	ShippingOriginCityName     string   `json:"shipping_origin_city_name"`
	EnabledCouriers            []string `json:"enabled_couriers"`
	FreeShippingThresholdCents int64    `json:"free_shipping_threshold_cents"`
}

// PUT /api/v1/store/shipping — narrow updater for the Pengiriman page.
func (h *StoreHandler) UpdateShipping(w http.ResponseWriter, r *http.Request) {
	uid, _ := auth.UserIDFromContext(r.Context())
	existing, err := h.stores.FindByOwnerID(r.Context(), uid)
	if errors.Is(err, repository.ErrStoreNotFound) {
		response.Error(w, http.StatusNotFound, "toko belum dibuat")
		return
	}
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	var req updateShippingReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.FreeShippingThresholdCents < 0 {
		response.Error(w, http.StatusBadRequest, "minimum belanja tidak boleh negatif")
		return
	}
	// Sanitize: drop empty / unknown courier codes. RajaOngkir starter
	// supports jne/tiki/pos; the built-in zone fallback supports six more
	// — accept the union.
	allowed := map[string]bool{
		"jne": true, "tiki": true, "pos": true,
		"jnt": true, "sicepat": true, "anteraja": true,
		"gosend": true, "grabexpress": true,
	}
	clean := make([]string, 0, len(req.EnabledCouriers))
	seen := map[string]bool{}
	for _, c := range req.EnabledCouriers {
		c = strings.ToLower(strings.TrimSpace(c))
		if !allowed[c] || seen[c] {
			continue
		}
		seen[c] = true
		clean = append(clean, c)
	}

	store, err := h.stores.UpdateShipping(r.Context(), existing.ID, repository.UpdateShippingInput{
		ShippingOriginCity:         strings.TrimSpace(req.ShippingOriginCity),
		ShippingOriginCityID:       strings.TrimSpace(req.ShippingOriginCityID),
		ShippingOriginCityName:     strings.TrimSpace(req.ShippingOriginCityName),
		EnabledCouriers:            clean,
		FreeShippingThresholdCents: req.FreeShippingThresholdCents,
	})
	if err != nil {
		h.logger.Error("update shipping", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal simpan")
		return
	}
	h.audit.Log(r.Context(), store.ID, audit.Event{
		Action:     "store.shipping_updated",
		EntityType: "store",
		EntityID:   store.ID.String(),
		Summary:    "Update setting pengiriman",
		Metadata: map[string]any{
			"origin_city":              store.ShippingOriginCityName,
			"enabled_couriers":         clean,
			"free_shipping_threshold":  store.FreeShippingThresholdCents,
		},
	})
	response.JSON(w, http.StatusOK, map[string]any{"store": toStoreDTO(store)})
}

var slugRe = regexp.MustCompile(`[^a-z0-9-]+`)

func sanitizeSlug(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = strings.ReplaceAll(s, " ", "-")
	s = slugRe.ReplaceAllString(s, "")
	s = strings.Trim(s, "-")
	if len(s) > 60 {
		s = s[:60]
	}
	return s
}

// PUT /api/v1/store/segments — update customer segment thresholds.
func (h *StoreHandler) UpdateSegments(w http.ResponseWriter, r *http.Request) {
	uid, _ := auth.UserIDFromContext(r.Context())
	store, err := h.stores.FindByOwnerID(r.Context(), uid)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	var req struct {
		VipThreshold   int    `json:"vip_threshold"`
		LoyalThreshold int    `json:"loyal_threshold"`
		BaruName       string `json:"baru_name"`
		RegulerName    string `json:"reguler_name"`
		LoyalName      string `json:"loyal_name"`
		VipName        string `json:"vip_name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.VipThreshold < 1 || req.LoyalThreshold < 1 {
		response.Error(w, http.StatusBadRequest, "threshold minimal 1")
		return
	}
	if strings.TrimSpace(req.BaruName) == "" {
		req.BaruName = "Baru"
	}
	if strings.TrimSpace(req.RegulerName) == "" {
		req.RegulerName = "Reguler"
	}
	if strings.TrimSpace(req.LoyalName) == "" {
		req.LoyalName = "Loyal"
	}
	if strings.TrimSpace(req.VipName) == "" {
		req.VipName = "VIP"
	}
	settings := repository.SegmentSettings{
		VipThreshold: req.VipThreshold, LoyalThreshold: req.LoyalThreshold,
		BaruName: req.BaruName, RegulerName: req.RegulerName,
		LoyalName: req.LoyalName, VipName: req.VipName,
	}
	if err := h.stores.UpdateSegmentSettings(r.Context(), store.ID, settings); err != nil {
		h.logger.Error("update segment thresholds", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	h.audit.Log(r.Context(), store.ID, audit.Event{
		Action:     "store.segment_thresholds_updated",
		EntityType: "store",
		EntityID:   store.ID.String(),
		Summary:    "Update threshold segmen pelanggan",
		Metadata: map[string]any{
			"vip_threshold":   req.VipThreshold,
			"loyal_threshold": req.LoyalThreshold,
		},
	})
	updated, _ := h.stores.FindByOwnerID(r.Context(), uid)
	response.JSON(w, http.StatusOK, map[string]any{"store": toStoreDTO(updated)})
}
