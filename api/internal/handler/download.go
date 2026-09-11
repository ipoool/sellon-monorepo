package handler

import (
	"errors"
	"github.com/sellon/sellon/api/internal/storage"
	"io"
	"log/slog"
	"net"
	"net/http"
	"path"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

type DownloadHandler struct {
	tokens  *repository.DownloadTokenRepo
	logs    *repository.DownloadLogRepo
	storage storage.Client
	logger  *slog.Logger
}

func NewDownloadHandler(tokens *repository.DownloadTokenRepo, logs *repository.DownloadLogRepo, storageCli storage.Client, logger *slog.Logger) *DownloadHandler {
	return &DownloadHandler{tokens: tokens, logs: logs, storage: storageCli, logger: logger}
}

// authorizeToken runs the checks shared by the delivery DTO and the file
// stream: the token exists, the buyer's session is for THIS token, and the
// link is neither revoked nor expired. It writes the response and returns
// nil when any check fails.
func (h *DownloadHandler) authorizeToken(w http.ResponseWriter, r *http.Request) *repository.DownloadInfo {
	token := chi.URLParam(r, "token")
	if token == "" || len(token) < 20 {
		response.Error(w, http.StatusNotFound, "link tidak valid")
		return nil
	}
	info, err := h.tokens.FindForDelivery(r.Context(), token)
	if errors.Is(err, repository.ErrDownloadTokenNotFound) {
		response.Error(w, http.StatusNotFound, "link tidak valid atau sudah di-revoke")
		return nil
	}
	if err != nil {
		h.logger.Error("download lookup", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return nil
	}
	claims, ok := auth.BuyerFromContext(r.Context())
	if !ok || claims.TokenID != info.Token.ID {
		response.Error(w, http.StatusForbidden, "sesi tidak cocok dengan link ini")
		return nil
	}
	if info.Token.RevokedAt != nil {
		response.Error(w, http.StatusForbidden, "link telah dinonaktifkan oleh penjual")
		return nil
	}
	if info.Token.ExpiresAt != nil && info.Token.ExpiresAt.Before(time.Now()) {
		response.Error(w, http.StatusGone, "link sudah kedaluwarsa")
		return nil
	}
	return info
}

// GET /api/v1/download/{token}/file  (RequireBuyer)
//
// Streams the deliverable through the buyer's OTP session instead of handing
// out the object URL. Before this, digital_file_url was a URL that worked
// forever for anyone it was forwarded to — revoking the link in the
// dashboard changed nothing, and none of those fetches were attributable.
// Routing the bytes through here means revoke and expiry actually bite.
func (h *DownloadHandler) File(w http.ResponseWriter, r *http.Request) {
	info := h.authorizeToken(w, r)
	if info == nil {
		return
	}
	if h.storage == nil || !h.storage.IsConfigured() {
		response.Error(w, http.StatusServiceUnavailable, "storage belum dikonfigurasi")
		return
	}
	key := h.storage.PathFromPublicURL(info.DigitalFileURL)
	if key == "" {
		// Seller pointed at a file hosted elsewhere; send them to it rather
		// than pretending we can stream it.
		if info.DigitalFileURL != "" {
			http.Redirect(w, r, info.DigitalFileURL, http.StatusFound)
			return
		}
		response.Error(w, http.StatusNotFound, "produk ini tidak punya file untuk diunduh")
		return
	}

	obj, err := h.storage.Get(r.Context(), key, "")
	if errors.Is(err, storage.ErrObjectNotFound) {
		response.Error(w, http.StatusNotFound, "file tidak ditemukan")
		return
	}
	if err != nil {
		h.logger.Warn("digital file stream", "err", err, "token_id", info.Token.ID)
		response.Error(w, http.StatusBadGateway, "gagal mengambil file")
		return
	}
	defer obj.Body.Close()

	if obj.ContentType != "" {
		w.Header().Set("Content-Type", obj.ContentType)
	}
	if obj.ContentLength >= 0 {
		w.Header().Set("Content-Length", strconv.FormatInt(obj.ContentLength, 10))
	}
	w.Header().Set("Content-Disposition", "attachment; filename=\""+downloadFilename(info.ProductName, key)+"\"")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	// Per-buyer and revocable: must never be cached by a shared proxy.
	w.Header().Set("Cache-Control", "private, no-store")
	if _, err := io.Copy(w, obj.Body); err != nil {
		h.logger.Debug("digital file copy interrupted", "err", err, "token_id", info.Token.ID)
	}
}

// downloadFilename builds a readable, safe attachment name from the product
// name plus the stored object's extension.
func downloadFilename(productName, key string) string {
	ext := path.Ext(key)
	base := strings.TrimSpace(productName)
	if base == "" {
		base = "file"
	}
	// Keep it to characters that survive every OS and the header itself.
	var b strings.Builder
	for _, r := range base {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9',
			r == '-', r == '_', r == ' ':
			b.WriteRune(r)
		default:
			b.WriteRune('-')
		}
	}
	name := strings.Trim(b.String(), " -")
	if name == "" {
		name = "file"
	}
	if len([]rune(name)) > 80 {
		name = string([]rune(name)[:80])
	}
	return name + ext
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
	// Edge-set headers first: client-side fetches (e.g. the course viewer)
	// reach the API behind Cloudflare/Caddy, which overwrite CF-Connecting-IP /
	// X-Forwarded-For with the real peer.
	//
	// X-Client-Ip comes from our own SSR page, which sits BEHIND that edge, so
	// it is only trustworthy when the edge headers are absent. Preferring it
	// unconditionally let a buyer who shares a link pin every access to one
	// forged IP and defeat the seller's "distinct IPs" share signal.
	edge := []string{
		r.Header.Get("CF-Connecting-IP"),
		firstForwarded(r.Header.Get("X-Forwarded-For")),
	}
	candidates := edge
	if strings.TrimSpace(edge[0]) == "" && strings.TrimSpace(edge[1]) == "" {
		candidates = append(candidates, r.Header.Get("X-Client-Ip"))
	}
	for _, c := range candidates {
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
	info := h.authorizeToken(w, r)
	if info == nil {
		return
	}

	out := downloadDTO{
		StoreName:          info.StoreName,
		StoreSlug:          info.StoreSlug,
		OrderNumber:        info.OrderNumber,
		CustomerName:       info.CustomerName,
		ProductName:        info.ProductName,
		VariantName:        info.VariantName,
		DigitalDeliveryURL: info.DigitalDeliveryURL,
		// The gated stream, not the object URL: handing out the latter made
		// revoke and expiry meaningless once a link had been forwarded.
		DigitalFileURL:      digitalFileEndpoint(info.Token.Token, info.DigitalFileURL),
		DigitalInstructions: info.DigitalInstructions,
		IssuedAt:            info.Token.CreatedAt.Format(time.RFC3339),
		ConsumedCount:       info.Token.ConsumedCount,
	}
	if info.Token.ExpiresAt != nil {
		out.ExpiresAt = info.Token.ExpiresAt.Format(time.RFC3339)
	}
	response.JSON(w, http.StatusOK, map[string]any{"download": out})
}

// digitalFileEndpoint returns the buyer-gated stream URL for a token, or ""
// when the product has no file at all. Relative on purpose: the browser is
// already on the API's origin for this fetch, and it keeps the value free of
// any host that would go stale behind a CDN or a domain change.
func digitalFileEndpoint(token, rawFileURL string) string {
	if strings.TrimSpace(rawFileURL) == "" {
		return ""
	}
	return "/api/v1/download/" + token + "/file"
}
