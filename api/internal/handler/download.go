package handler

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

type DownloadHandler struct {
	tokens *repository.DownloadTokenRepo
	logs   *repository.DownloadLogRepo
	logger *slog.Logger
}

func NewDownloadHandler(tokens *repository.DownloadTokenRepo, logs *repository.DownloadLogRepo, logger *slog.Logger) *DownloadHandler {
	return &DownloadHandler{tokens: tokens, logs: logs, logger: logger}
}

const (
	maxIPLen = 64
	maxUALen = 512
)

// clientIP / clientUA prefer the buyer's real values forwarded by the Next.js
// SSR download page (X-Client-Ip / X-Client-User-Agent) — in production the
// request reaches this endpoint from the SSR server, so r.RemoteAddr is the
// SSR/proxy address, not the buyer's. The forwarded header carries the real
// buyer value. For direct hits (no header) we fall back to r.RemoteAddr /
// r.UserAgent(). Values are validated/capped before storage since this is a
// public endpoint and the headers are attacker-controllable.
func clientIP(r *http.Request) string {
	if v := strings.TrimSpace(r.Header.Get("X-Client-Ip")); v != "" && net.ParseIP(v) != nil {
		return v
	}
	ip := r.RemoteAddr
	if len(ip) > maxIPLen {
		ip = ip[:maxIPLen]
	}
	return ip
}

func clientUA(r *http.Request) string {
	v := strings.TrimSpace(r.Header.Get("X-Client-User-Agent"))
	if v == "" {
		v = r.UserAgent()
	}
	if len(v) > maxUALen {
		v = v[:maxUALen]
	}
	return v
}

type downloadDTO struct {
	StoreName           string `json:"store_name"`
	StoreSlug           string `json:"store_slug"`
	OrderNumber         string `json:"order_number"`
	CustomerName        string `json:"customer_name"`
	ProductName         string `json:"product_name"`
	VariantName         string `json:"variant_name"`
	DigitalDeliveryURL  string `json:"digital_delivery_url"`
	DigitalFileURL      string `json:"digital_file_url"`
	DigitalInstructions string `json:"digital_instructions"`
	IssuedAt            string `json:"issued_at"`
	ExpiresAt           string `json:"expires_at,omitempty"`
	ConsumedCount       int    `json:"consumed_count"`
}

// GET /api/v1/download/{token}
//
// Public — no auth. Validates the token, increments the consumed
// counter (best-effort), and returns the delivery info. Generic error
// on miss to avoid leaking which tokens exist.
func (h *DownloadHandler) Get(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	if token == "" || len(token) < 20 {
		response.Error(w, http.StatusNotFound, "link tidak valid")
		return
	}
	info, err := h.tokens.FindForDelivery(r.Context(), token)
	if errors.Is(err, repository.ErrDownloadTokenNotFound) {
		response.Error(w, http.StatusNotFound, "link tidak valid atau sudah di-revoke")
		return
	}
	if err != nil {
		h.logger.Error("download lookup", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	// IP/UA captured here (request is gone by the time the audit goroutine runs).
	ip, ua := clientIP(r), clientUA(r)

	// Blocked attempts (revoked / expired) are STILL audited — a leaked link
	// being hammered after revoke is the highest-value signal for the seller.
	// They're flagged Blocked=true so they don't inflate the share counts.
	if info.Token.RevokedAt != nil {
		h.logAccess(*info, ip, ua, true)
		response.Error(w, http.StatusForbidden, "link telah dinonaktifkan oleh penjual")
		return
	}
	if info.Token.ExpiresAt != nil && info.Token.ExpiresAt.Before(time.Now()) {
		h.logAccess(*info, ip, ua, true)
		response.Error(w, http.StatusGone, "link sudah kedaluwarsa")
		return
	}

	// Successful open: bump consumption + audit (not blocked).
	go func(t string) {
		bgCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := h.tokens.MarkConsumed(bgCtx, t); err != nil {
			h.logger.Error("download: mark consumed", "err", err, "token_prefix", t[:8])
		}
	}(token)
	h.logAccess(*info, ip, ua, false)

	out := downloadDTO{
		StoreName:           info.StoreName,
		StoreSlug:           info.StoreSlug,
		OrderNumber:         info.OrderNumber,
		CustomerName:        info.CustomerName,
		ProductName:         info.ProductName,
		VariantName:         info.VariantName,
		DigitalDeliveryURL:  info.DigitalDeliveryURL,
		DigitalFileURL:      info.DigitalFileURL,
		DigitalInstructions: info.DigitalInstructions,
		IssuedAt:            info.Token.CreatedAt.Format(time.RFC3339),
		ConsumedCount:       info.Token.ConsumedCount,
	}
	if info.Token.ExpiresAt != nil {
		out.ExpiresAt = info.Token.ExpiresAt.Format(time.RFC3339)
	}
	response.JSON(w, http.StatusOK, map[string]any{"download": out})
}

// logAccess records one download-link access (best-effort, detached from the
// request context which dies when the handler returns). blocked=true marks a
// hit on a revoked/expired link so the seller can see post-revoke abuse without
// it polluting the success/share counts.
func (h *DownloadHandler) logAccess(in repository.DownloadInfo, ip, ua string, blocked bool) {
	go func() {
		bgCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := h.logs.Create(bgCtx, repository.DownloadLog{
			TokenID:     in.Token.ID,
			StoreID:     in.Token.StoreID,
			OrderID:     in.Token.OrderID,
			OrderItemID: in.Token.OrderItemID,
			CustomerID:  in.CustomerID,
			IPAddress:   ip,
			UserAgent:   ua,
			Blocked:     blocked,
		}); err != nil {
			h.logger.Error("download: audit log", "err", err, "token", in.Token.ID)
		}
	}()
}
