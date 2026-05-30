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
)

type TableHandler struct {
	tables *repository.TableRepo
	stores *repository.StoreRepo
	subs   *repository.SubscriptionRepo
	audit  *audit.Logger
	logger *slog.Logger
}

func NewTableHandler(tables *repository.TableRepo, stores *repository.StoreRepo, subs *repository.SubscriptionRepo, audit *audit.Logger, logger *slog.Logger) *TableHandler {
	return &TableHandler{tables: tables, stores: stores, subs: subs, audit: audit, logger: logger}
}

func (h *TableHandler) requireStore(r *http.Request) (*repository.Store, error) {
	uid, _ := auth.UserIDFromContext(r.Context())
	return h.stores.FindByOwnerID(r.Context(), uid)
}

func (h *TableHandler) proBlocked(w http.ResponseWriter, r *http.Request, storeID uuid.UUID) bool {
	sub, err := h.subs.GetOrCreate(r.Context(), storeID)
	if err == nil && sub.Plan == "free" {
		response.JSON(w, http.StatusPaymentRequired, map[string]any{"error": "plan_required", "plan": "pro"})
		return true
	}
	return false
}

type tableDTO struct {
	ID      string `json:"id"`
	Label   string `json:"label"`
	Area    string `json:"area"`
	QRToken string `json:"qr_token"`
}

func (h *TableHandler) List(w http.ResponseWriter, r *http.Request) {
	store, err := h.requireStore(r)
	if errors.Is(err, repository.ErrStoreNotFound) {
		response.JSON(w, http.StatusOK, map[string]any{"tables": []tableDTO{}})
		return
	}
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	rows, err := h.tables.ListByStore(r.Context(), store.ID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	out := make([]tableDTO, 0, len(rows))
	for _, t := range rows {
		out = append(out, tableDTO{ID: t.ID.String(), Label: t.Label, Area: t.Area, QRToken: t.QRToken})
	}
	response.JSON(w, http.StatusOK, map[string]any{"tables": out})
}

func (h *TableHandler) Create(w http.ResponseWriter, r *http.Request) {
	store, err := h.requireStore(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	if h.proBlocked(w, r, store.ID) {
		return
	}
	var in struct {
		Label string `json:"label"`
		Area  string `json:"area"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if strings.TrimSpace(in.Label) == "" {
		response.Error(w, http.StatusBadRequest, "nama/nomor meja wajib")
		return
	}
	t, err := h.tables.Create(r.Context(), store.ID, strings.TrimSpace(in.Label), strings.TrimSpace(in.Area))
	if err != nil {
		response.Error(w, http.StatusConflict, "gagal buat meja (label mungkin duplikat)")
		return
	}
	response.JSON(w, http.StatusCreated, map[string]any{"table": tableDTO{ID: t.ID.String(), Label: t.Label, Area: t.Area, QRToken: t.QRToken}})
}

func (h *TableHandler) Update(w http.ResponseWriter, r *http.Request) {
	store, err := h.requireStore(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "id invalid")
		return
	}
	var in struct {
		Label string `json:"label"`
		Area  string `json:"area"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if err := h.tables.Update(r.Context(), store.ID, id, strings.TrimSpace(in.Label), strings.TrimSpace(in.Area)); err != nil {
		response.Error(w, http.StatusNotFound, "meja tidak ditemukan")
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *TableHandler) Delete(w http.ResponseWriter, r *http.Request) {
	store, err := h.requireStore(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "id invalid")
		return
	}
	if err := h.tables.SoftDelete(r.Context(), store.ID, id); err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

// GET /api/v1/tables/resolve/{token} — PUBLIC (no auth).
func (h *TableHandler) Resolve(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	res, err := h.tables.ResolveByToken(r.Context(), token)
	if errors.Is(err, repository.ErrTableNotFound) {
		response.Error(w, http.StatusNotFound, "meja tidak ditemukan")
		return
	}
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{
		"store_slug":   res.StoreSlug,
		"store_name":   res.StoreName,
		"table_id":     res.TableID.String(),
		"table_label":  res.TableLabel,
		"payment_mode": res.PaymentMode,
		"dinein_enabled": res.DineInOn,
	})
}

// GET /api/v1/store/dinein
func (h *TableHandler) GetDineIn(w http.ResponseWriter, r *http.Request) {
	store, err := h.requireStore(r)
	if err != nil {
		response.JSON(w, http.StatusOK, map[string]any{
			"enabled": false, "payment_mode": "cashier", "kds_enabled": false,
			"qr_layout": "classic", "qr_fg_color": "#0F172A", "qr_bg_color": "#FFFFFF",
			"qr_headline": "", "qr_caption": "Scan untuk pesan",
		})
		return
	}
	s, err := h.tables.GetDineInSettings(r.Context(), store.ID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{
		"enabled": s.Enabled, "payment_mode": s.PaymentMode, "kds_enabled": s.KDSEnabled,
		"qr_layout": s.QRLayout, "qr_fg_color": s.QRFgColor, "qr_bg_color": s.QRBgColor,
		"qr_headline": s.QRHeadline, "qr_caption": s.QRCaption,
	})
}

// PUT /api/v1/store/dinein
func (h *TableHandler) UpdateDineIn(w http.ResponseWriter, r *http.Request) {
	store, err := h.requireStore(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	if h.proBlocked(w, r, store.ID) {
		return
	}
	var in struct {
		Enabled     bool   `json:"enabled"`
		PaymentMode string `json:"payment_mode"`
		KDSEnabled  bool   `json:"kds_enabled"`
		QRLayout    string `json:"qr_layout"`
		QRFgColor   string `json:"qr_fg_color"`
		QRBgColor   string `json:"qr_bg_color"`
		QRHeadline  string `json:"qr_headline"`
		QRCaption   string `json:"qr_caption"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if err := h.tables.UpdateDineInSettings(r.Context(), store.ID, repository.DineInSettings{
		Enabled: in.Enabled, PaymentMode: in.PaymentMode, KDSEnabled: in.KDSEnabled,
		QRLayout: in.QRLayout, QRFgColor: in.QRFgColor, QRBgColor: in.QRBgColor,
		QRHeadline: in.QRHeadline, QRCaption: in.QRCaption,
	}); err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"ok": true})
}
