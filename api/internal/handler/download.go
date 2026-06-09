package handler

import (
	"errors"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/sellon/sellon/api/internal/auth"
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
	// Prefer the buyer's real IP. SSR pages forward X-Client-Ip; client-side
	// fetches (e.g. the course viewer) reach the API behind Cloudflare/Caddy,
	// which carry the real client in CF-Connecting-IP / X-Forwarded-For.
	for _, c := range []string{
		r.Header.Get("X-Client-Ip"),
		r.Header.Get("CF-Connecting-IP"),
		firstForwarded(r.Header.Get("X-Forwarded-For")),
	} {
		c = strings.TrimSpace(c)
		if c != "" && net.ParseIP(c) != nil {
			return c
		}
	}
	// Fallback: strip the ephemeral port so the audit groups by host, not
	// host:port (a varying port made every request look like a brand-new IP).
	ip := r.RemoteAddr
	if host, _, err := net.SplitHostPort(ip); err == nil {
		ip = host
	}
	if len(ip) > maxIPLen {
		ip = ip[:maxIPLen]
	}
	return ip
}

// firstForwarded returns the left-most (original client) entry of an
// X-Forwarded-For header.
func firstForwarded(xff string) string {
	if i := strings.IndexByte(xff, ','); i >= 0 {
		return xff[:i]
	}
	return xff
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

// GET /api/v1/download/{token}  (RequireBuyer)
//
// Returns the digital delivery info, gated behind the buyer's OTP session
// (scoped to a single token). Access is recorded ONCE at OTP-verify time, so
// this endpoint no longer logs or bumps a counter. Generic 404 on miss so token
// existence isn't leaked.
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

	// The buyer session must be for THIS token.
	claims, ok := auth.BuyerFromContext(r.Context())
	if !ok || claims.TokenID != info.Token.ID {
		response.Error(w, http.StatusForbidden, "sesi tidak cocok dengan link ini")
		return
	}
	if info.Token.RevokedAt != nil {
		response.Error(w, http.StatusForbidden, "link telah dinonaktifkan oleh penjual")
		return
	}
	if info.Token.ExpiresAt != nil && info.Token.ExpiresAt.Before(time.Now()) {
		response.Error(w, http.StatusGone, "link sudah kedaluwarsa")
		return
	}

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
