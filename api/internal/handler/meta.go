package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"

	"github.com/sellon/sellon/api/internal/audit"
	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

// MetaHandler manages the per-seller Meta (Facebook) integration config:
// Pixel ID (browser-public), Conversions API access token (stored encrypted),
// optional test-event code, and the catalog id. Mirrors the Midtrans
// credential pattern (PaymentHandler.Save) for encrypt-on-write.
type MetaHandler struct {
	stores         *repository.StoreRepo
	encryptor      *auth.AESEncryptor
	webhookBaseURL string // public API base; Meta crawls the feed here
	audit          *audit.Logger
	logger         *slog.Logger
}

func NewMetaHandler(stores *repository.StoreRepo, enc *auth.AESEncryptor, webhookBaseURL string, audit *audit.Logger, logger *slog.Logger) *MetaHandler {
	return &MetaHandler{stores: stores, encryptor: enc, webhookBaseURL: strings.TrimRight(webhookBaseURL, "/"), audit: audit, logger: logger}
}

func (h *MetaHandler) storeFor(r *http.Request) (*repository.Store, error) {
	uid, _ := auth.UserIDFromContext(r.Context())
	return h.stores.FindByOwnerID(r.Context(), uid)
}

// feedURL is the public catalog feed URL the seller registers in Commerce
// Manager as a scheduled data source. Built from the immutable store UUID (not
// the slug) so the registered URL never breaks if the store slug changes.
func (h *MetaHandler) feedURL(storeID string) string {
	return h.webhookBaseURL + "/api/v1/storefront/" + storeID + "/meta-feed.xml"
}

type metaConfigDTO struct {
	Enabled       bool   `json:"enabled"`
	PixelID       string `json:"pixel_id"`
	TestEventCode string `json:"test_event_code"`
	CatalogID     string `json:"catalog_id"`
	HasToken      bool   `json:"has_token"` // never expose the token itself
	FeedURL       string `json:"feed_url"`
}

// GET /api/v1/store/meta
func (h *MetaHandler) Get(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	response.JSON(w, http.StatusOK, metaConfigDTO{
		Enabled:       store.MetaEnabled,
		PixelID:       store.MetaPixelID,
		TestEventCode: store.MetaTestEventCode,
		CatalogID:     store.MetaCatalogID,
		HasToken:      len(store.MetaAccessTokenEnc) > 0,
		FeedURL:       h.feedURL(store.ID.String()),
	})
}

type saveMetaReq struct {
	Enabled       bool   `json:"enabled"`
	PixelID       string `json:"pixel_id"`
	AccessToken   string `json:"access_token"` // empty = keep existing
	TestEventCode string `json:"test_event_code"`
	CatalogID     string `json:"catalog_id"`
}

// PUT /api/v1/store/meta — gated to Bisnis (feature.MetaIntegration) at the route.
func (h *MetaHandler) Save(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	var req saveMetaReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	req.PixelID = strings.TrimSpace(req.PixelID)
	req.AccessToken = strings.TrimSpace(req.AccessToken)
	req.TestEventCode = strings.TrimSpace(req.TestEventCode)
	req.CatalogID = strings.TrimSpace(req.CatalogID)

	// Enabling requires a Pixel ID (events need it; the feed alone doesn't,
	// but "enabled" means tracking is on).
	if req.Enabled && req.PixelID == "" {
		response.Error(w, http.StatusBadRequest, "Pixel ID wajib diisi untuk mengaktifkan")
		return
	}

	// Encrypt the token only when a new one is provided. Empty -> nil = keep
	// the stored token (so editing other fields doesn't wipe it).
	var tokenBlob []byte
	if req.AccessToken != "" {
		tokenBlob, err = h.encryptor.Encrypt([]byte(req.AccessToken))
		if err != nil {
			h.logger.Error("encrypt meta token", "err", err)
			response.Error(w, http.StatusInternalServerError, "gagal enkripsi token")
			return
		}
	}

	if err := h.stores.UpdateMeta(r.Context(), store.ID, repository.UpdateMetaInput{
		Enabled:        req.Enabled,
		PixelID:        req.PixelID,
		AccessTokenEnc: tokenBlob,
		TestEventCode:  req.TestEventCode,
		CatalogID:      req.CatalogID,
	}); err != nil {
		h.logger.Error("save meta config", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal menyimpan konfigurasi Meta")
		return
	}

	h.audit.Log(r.Context(), store.ID, audit.Event{
		Action:     "store.meta_updated",
		EntityType: "store",
		EntityID:   store.ID.String(),
		Summary:    "Update integrasi Meta (Pixel/CAPI)",
		Metadata: map[string]any{
			"enabled":      req.Enabled,
			"pixel_id":     req.PixelID,
			"token_set":    tokenBlob != nil || len(store.MetaAccessTokenEnc) > 0,
			"catalog_id":   req.CatalogID,
		},
	})

	response.JSON(w, http.StatusOK, metaConfigDTO{
		Enabled:       req.Enabled,
		PixelID:       req.PixelID,
		TestEventCode: req.TestEventCode,
		CatalogID:     req.CatalogID,
		HasToken:      tokenBlob != nil || len(store.MetaAccessTokenEnc) > 0,
		FeedURL:       h.feedURL(store.ID.String()),
	})
}
