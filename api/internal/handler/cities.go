package handler

import (
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/shipping/rajaongkir"
)

type CitiesHandler struct {
	rajaongkir *rajaongkir.Client
	logger     *slog.Logger
}

func NewCitiesHandler(rk *rajaongkir.Client, logger *slog.Logger) *CitiesHandler {
	return &CitiesHandler{rajaongkir: rk, logger: logger}
}

// GET /api/v1/cities/search?q=jakarta&limit=15
//
// Public — used by both the Pengaturan Pengiriman picker (seller side)
// and the buyer's checkout city autocomplete. Falls back to 503 when no
// API key is configured so the frontend can show a graceful empty state.
func (h *CitiesHandler) Search(w http.ResponseWriter, r *http.Request) {
	if h.rajaongkir == nil || !h.rajaongkir.IsConfigured() {
		response.Error(w, http.StatusServiceUnavailable, "rajaongkir belum dikonfigurasi")
		return
	}
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 {
		limit = 12
	}
	cities, err := h.rajaongkir.SearchCities(r.Context(), q, limit)
	if err != nil {
		h.logger.Warn("city search", "err", err)
		response.Error(w, http.StatusBadGateway, "gagal cari kota")
		return
	}
	out := make([]map[string]string, 0, len(cities))
	for _, c := range cities {
		out = append(out, map[string]string{
			"id":          c.CityID,
			"name":        c.Type + " " + c.CityName,
			"province":    c.Province,
			"postal_code": c.PostalCode,
		})
	}
	response.JSON(w, http.StatusOK, map[string]any{"cities": out})
}
