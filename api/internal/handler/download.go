package handler

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

type DownloadHandler struct {
	tokens *repository.DownloadTokenRepo
	logger *slog.Logger
}

func NewDownloadHandler(tokens *repository.DownloadTokenRepo, logger *slog.Logger) *DownloadHandler {
	return &DownloadHandler{tokens: tokens, logger: logger}
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

	if info.Token.ExpiresAt != nil && info.Token.ExpiresAt.Before(time.Now()) {
		response.Error(w, http.StatusGone, "link sudah kedaluwarsa")
		return
	}

	// Best-effort consumption bump. Detach from r.Context() — that ctx
	// is cancelled the instant the handler returns (BUG-021), causing
	// the UPDATE to silently drop. context.Background with a short
	// timeout keeps the goroutine alive long enough to commit, and any
	// failure is logged rather than swallowed so we can spot a broken
	// audit pipeline.
	go func(t string) {
		bgCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := h.tokens.MarkConsumed(bgCtx, t); err != nil {
			h.logger.Error("download: mark consumed",
				"err", err, "token_prefix", t[:8])
		}
	}(token)

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
