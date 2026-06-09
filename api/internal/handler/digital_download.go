package handler

import (
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

// DigitalDownloadHandler serves the seller-facing download audit: which digital
// download links exist, how many times + from how many distinct IPs they were
// opened (share signal), the per-link access history, and per-link revoke.
type DigitalDownloadHandler struct {
	tokens *repository.DownloadTokenRepo
	logs   *repository.DownloadLogRepo
	stores *repository.StoreRepo
	logger *slog.Logger
}

func NewDigitalDownloadHandler(tokens *repository.DownloadTokenRepo, logs *repository.DownloadLogRepo, stores *repository.StoreRepo, logger *slog.Logger) *DigitalDownloadHandler {
	return &DigitalDownloadHandler{tokens: tokens, logs: logs, stores: stores, logger: logger}
}

func (h *DigitalDownloadHandler) storeFor(r *http.Request) (*repository.Store, error) {
	uid, _ := auth.UserIDFromContext(r.Context())
	return h.stores.FindByOwnerID(r.Context(), uid)
}

func linkDTO(l repository.DownloadLink) map[string]any {
	var cid string
	if l.CustomerID != nil {
		cid = l.CustomerID.String()
	}
	var lastAt, revokedAt string
	if l.LastDownloadAt != nil {
		lastAt = l.LastDownloadAt.Format(time.RFC3339)
	}
	if l.RevokedAt != nil {
		revokedAt = l.RevokedAt.Format(time.RFC3339)
	}
	return map[string]any{
		"token_id":         l.TokenID.String(),
		"order_id":         l.OrderID.String(),
		"order_number":     l.OrderNumber,
		"product_name":     l.ProductName,
		"variant_name":     l.VariantName,
		"product_type":     l.ProductType,
		"customer_id":      cid,
		"customer_name":    l.CustomerName,
		"download_count":   l.DownloadCount,
		"distinct_ips":     l.DistinctIPs,
		"last_download_at": lastAt,
		"revoked":          l.RevokedAt != nil,
		"revoked_at":       revokedAt,
		"created_at":       l.CreatedAt.Format(time.RFC3339),
	}
}

// GET /api/v1/digital-downloads?q=&limit=&offset=
func (h *DigitalDownloadHandler) List(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if errors.Is(err, repository.ErrStoreNotFound) {
		response.JSON(w, http.StatusOK, map[string]any{"links": []any{}, "total": 0})
		return
	}
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 || limit > 100 {
		limit = 25
	}
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	if offset < 0 {
		offset = 0
	}
	links, total, err := h.logs.ListLinksByStore(r.Context(), store.ID, q, limit, offset)
	if err != nil {
		h.logger.Error("digital downloads list", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	out := make([]map[string]any, 0, len(links))
	for _, l := range links {
		out = append(out, linkDTO(l))
	}
	response.JSON(w, http.StatusOK, map[string]any{"links": out, "total": total})
}

// GET /api/v1/digital-downloads/{tokenId}/logs — access history for one link.
func (h *DigitalDownloadHandler) Logs(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	tokenID, err := uuid.Parse(chi.URLParam(r, "tokenId"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "id invalid")
		return
	}
	rows, err := h.logs.ListAccessByToken(r.Context(), store.ID, tokenID)
	if err != nil {
		h.logger.Error("digital downloads logs", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	out := make([]map[string]any, 0, len(rows))
	for _, a := range rows {
		out = append(out, map[string]any{
			"ip_address":    a.IPAddress,
			"user_agent":    a.UserAgent,
			"blocked":       a.Blocked,
			"downloaded_at": a.DownloadedAt.Format(time.RFC3339),
		})
	}
	response.JSON(w, http.StatusOK, map[string]any{"logs": out})
}

// POST /api/v1/digital-downloads/{tokenId}/revoke
func (h *DigitalDownloadHandler) Revoke(w http.ResponseWriter, r *http.Request) {
	h.setRevoked(w, r, true)
}

// POST /api/v1/digital-downloads/{tokenId}/unrevoke
func (h *DigitalDownloadHandler) Unrevoke(w http.ResponseWriter, r *http.Request) {
	h.setRevoked(w, r, false)
}

func (h *DigitalDownloadHandler) setRevoked(w http.ResponseWriter, r *http.Request, revoke bool) {
	store, err := h.storeFor(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	tokenID, err := uuid.Parse(chi.URLParam(r, "tokenId"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "id invalid")
		return
	}
	if revoke {
		err = h.tokens.Revoke(r.Context(), store.ID, tokenID)
	} else {
		err = h.tokens.Unrevoke(r.Context(), store.ID, tokenID)
	}
	if errors.Is(err, repository.ErrDownloadTokenNotFound) {
		response.Error(w, http.StatusNotFound, "link tidak ditemukan")
		return
	}
	if err != nil {
		h.logger.Error("digital downloads revoke", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"ok": true, "revoked": revoke})
}

// GET /api/v1/customers/{id}/downloads — links tied to one customer.
func (h *DigitalDownloadHandler) ByCustomer(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	customerID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "id invalid")
		return
	}
	links, err := h.logs.ListLinksByCustomer(r.Context(), store.ID, customerID)
	if err != nil {
		h.logger.Error("digital downloads by customer", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	out := make([]map[string]any, 0, len(links))
	for _, l := range links {
		out = append(out, linkDTO(l))
	}
	response.JSON(w, http.StatusOK, map[string]any{"links": out})
}
