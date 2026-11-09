package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/sellon/sellon/api/internal/audit"
	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
	"github.com/sellon/sellon/api/internal/shipping"
)

// ShippingRateHandler is the seller's own ongkir table.
//
// Gated behind feature.CustomShipping by the router, so everything here can
// assume the store is entitled. The storefront quote re-checks the plan
// independently — a store that lapses must stop serving rates it can no
// longer edit.
type ShippingRateHandler struct {
	rates  *repository.ShippingRateRepo
	stores *repository.StoreRepo
	audit  *audit.Logger
	logger *slog.Logger
}

func NewShippingRateHandler(
	rates *repository.ShippingRateRepo,
	stores *repository.StoreRepo,
	auditLog *audit.Logger,
	logger *slog.Logger,
) *ShippingRateHandler {
	return &ShippingRateHandler{rates: rates, stores: stores, audit: auditLog, logger: logger}
}

type shippingRateDTO struct {
	ID         string   `json:"id"`
	Name       string   `json:"name"`
	PriceCents int64    `json:"price_cents"`
	ETA        string   `json:"eta"`
	Areas      []string `json:"areas"`
	IsFallback bool     `json:"is_fallback"`
	IsActive   bool     `json:"is_active"`
	SortOrder  int      `json:"sort_order"`
}

func toShippingRateDTO(r repository.ShippingRate) shippingRateDTO {
	areas := r.Areas
	if areas == nil {
		areas = []string{}
	}
	return shippingRateDTO{
		ID: r.ID.String(), Name: r.Name, PriceCents: r.PriceCents,
		ETA: r.ETA, Areas: areas, IsFallback: r.IsFallback,
		IsActive: r.IsActive, SortOrder: r.SortOrder,
	}
}

// GET /api/v1/shipping-rates
func (h *ShippingRateHandler) List(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	rows, err := h.rates.ListForStore(r.Context(), store.ID)
	if err != nil {
		h.logger.Error("shipping rates list", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	out := make([]shippingRateDTO, 0, len(rows))
	for _, row := range rows {
		out = append(out, toShippingRateDTO(row))
	}
	response.JSON(w, http.StatusOK, map[string]any{"rates": out})
}

type shippingRateReq struct {
	Name       string   `json:"name"`
	PriceCents int64    `json:"price_cents"`
	ETA        string   `json:"eta"`
	Areas      []string `json:"areas"`
	IsFallback bool     `json:"is_fallback"`
	IsActive   *bool    `json:"is_active"`
	SortOrder  int      `json:"sort_order"`
}

// maxAreasPerRate caps a single rate's city list. Generous for a real
// delivery radius, and a bound on what one row can cost to match.
const maxAreasPerRate = 200

// maxRatesPerStore keeps the storefront quote O(small). A seller needing
// more than this is describing a courier, not their own motorbike.
const maxRatesPerStore = 50

// parse validates and normalises. Area names are normalised HERE, with the
// same function the matcher uses, so a rate can never be stored in a
// spelling that will not match.
func (req shippingRateReq) parse() (repository.ShippingRate, string) {
	var out repository.ShippingRate

	out.Name = strings.TrimSpace(req.Name)
	if out.Name == "" {
		return out, "nama ongkir wajib diisi"
	}
	if len([]rune(out.Name)) > 60 {
		return out, "nama ongkir terlalu panjang (maksimal 60 karakter)"
	}
	if req.PriceCents < 0 {
		return out, "ongkir tidak boleh negatif"
	}
	// One billion rupiah of shipping is a typo, not a tariff.
	if req.PriceCents > 100_000_000_00 {
		return out, "ongkir terlalu besar"
	}
	out.PriceCents = req.PriceCents

	out.ETA = strings.TrimSpace(req.ETA)
	if len([]rune(out.ETA)) > 40 {
		return out, "estimasi terlalu panjang"
	}

	if req.IsFallback && len(req.Areas) > 0 {
		return out, "tarif “semua area lain” tidak boleh punya daftar kota"
	}
	if len(req.Areas) > maxAreasPerRate {
		return out, "daftar kota terlalu banyak"
	}
	seen := map[string]bool{}
	areas := make([]string, 0, len(req.Areas))
	for _, a := range req.Areas {
		n := shipping.NormalizeArea(a)
		if n == "" || seen[n] {
			continue
		}
		seen[n] = true
		areas = append(areas, n)
	}
	out.Areas = areas
	out.IsFallback = req.IsFallback

	out.IsActive = true
	if req.IsActive != nil {
		out.IsActive = *req.IsActive
	}
	out.SortOrder = req.SortOrder
	return out, ""
}

// POST /api/v1/shipping-rates
func (h *ShippingRateHandler) Create(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	var req shippingRateReq
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "body tidak valid")
		return
	}
	rate, msg := req.parse()
	if msg != "" {
		response.Error(w, http.StatusBadRequest, msg)
		return
	}
	rate.StoreID = store.ID

	existing, err := h.rates.ListForStore(r.Context(), store.ID)
	if err != nil {
		h.logger.Error("shipping rates count", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	if len(existing) >= maxRatesPerStore {
		response.Error(w, http.StatusBadRequest, "jumlah tarif ongkir sudah maksimal")
		return
	}

	created, err := h.rates.Create(r.Context(), rate)
	if errors.Is(err, repository.ErrFallbackExists) {
		response.Error(w, http.StatusConflict,
			"sudah ada tarif “semua area lain” yang aktif — nonaktifkan dulu yang lama")
		return
	}
	if err != nil {
		h.logger.Error("shipping rate create", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal menyimpan")
		return
	}
	h.log(r, store.ID, "shipping_rate.created", "Tambah ongkir "+created.Name)
	response.JSON(w, http.StatusCreated, map[string]any{"rate": toShippingRateDTO(*created)})
}

// PUT /api/v1/shipping-rates/{id}
func (h *ShippingRateHandler) Update(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "id tidak valid")
		return
	}
	var req shippingRateReq
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "body tidak valid")
		return
	}
	rate, msg := req.parse()
	if msg != "" {
		response.Error(w, http.StatusBadRequest, msg)
		return
	}
	rate.ID = id
	rate.StoreID = store.ID

	updated, err := h.rates.Update(r.Context(), rate)
	if errors.Is(err, repository.ErrFallbackExists) {
		response.Error(w, http.StatusConflict,
			"sudah ada tarif “semua area lain” yang aktif — nonaktifkan dulu yang lama")
		return
	}
	if errors.Is(err, repository.ErrShippingRateNotFound) {
		response.Error(w, http.StatusNotFound, "tarif ongkir tidak ditemukan")
		return
	}
	if err != nil {
		h.logger.Error("shipping rate update", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal menyimpan")
		return
	}
	h.log(r, store.ID, "shipping_rate.updated", "Ubah ongkir "+updated.Name)
	response.JSON(w, http.StatusOK, map[string]any{"rate": toShippingRateDTO(*updated)})
}

// DELETE /api/v1/shipping-rates/{id}
func (h *ShippingRateHandler) Delete(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "id tidak valid")
		return
	}
	if err := h.rates.Delete(r.Context(), store.ID, id); err != nil {
		if errors.Is(err, repository.ErrShippingRateNotFound) {
			response.Error(w, http.StatusNotFound, "tarif ongkir tidak ditemukan")
			return
		}
		h.logger.Error("shipping rate delete", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal menghapus")
		return
	}
	h.log(r, store.ID, "shipping_rate.deleted", "Hapus satu tarif ongkir")
	response.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *ShippingRateHandler) storeFor(r *http.Request) (*repository.Store, error) {
	uid, _ := auth.UserIDFromContext(r.Context())
	return h.stores.FindByOwnerID(r.Context(), uid)
}

func (h *ShippingRateHandler) log(r *http.Request, storeID uuid.UUID, action, summary string) {
	h.audit.Log(r.Context(), storeID, audit.Event{
		Action:     action,
		EntityType: "shipping_rate",
		Summary:    summary,
	})
}
