package handler

import (
	"encoding/csv"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/sellon/sellon/api/internal/audit"
	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

type MaterialHandler struct {
	materials *repository.MaterialRepo
	stores    *repository.StoreRepo
	subs      *repository.SubscriptionRepo
	audit     *audit.Logger
	logger    *slog.Logger
}

func NewMaterialHandler(materials *repository.MaterialRepo, stores *repository.StoreRepo, subs *repository.SubscriptionRepo, audit *audit.Logger, logger *slog.Logger) *MaterialHandler {
	return &MaterialHandler{materials: materials, stores: stores, subs: subs, audit: audit, logger: logger}
}

func (h *MaterialHandler) requireStore(r *http.Request) (*repository.Store, error) {
	uid, _ := auth.UserIDFromContext(r.Context())
	return h.stores.FindByOwnerID(r.Context(), uid)
}

type materialDTO struct {
	ID                string `json:"id"`
	Name              string `json:"name"`
	Kind              string `json:"kind"`
	BaseUnit          string `json:"base_unit"`
	CostCents         int64  `json:"cost_cents"`
	Stock             int64  `json:"stock"`
	LowStockThreshold int64  `json:"low_stock_threshold"`
	LowStock          bool   `json:"low_stock"`
	IsActive          bool   `json:"is_active"`
	CreatedAt         string `json:"created_at"`
}

func toMaterialDTO(m repository.Material) materialDTO {
	return materialDTO{
		ID: m.ID.String(), Name: m.Name, Kind: m.Kind, BaseUnit: m.BaseUnit,
		CostCents: m.CostCents, Stock: m.Stock, LowStockThreshold: m.LowStockThreshold,
		LowStock:  m.LowStockThreshold > 0 && m.Stock <= m.LowStockThreshold,
		IsActive:  m.IsActive,
		CreatedAt: m.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
}

// GET /api/v1/materials?low_stock=1&include_inactive=1
func (h *MaterialHandler) List(w http.ResponseWriter, r *http.Request) {
	store, err := h.requireStore(r)
	if errors.Is(err, repository.ErrStoreNotFound) {
		response.JSON(w, http.StatusOK, map[string]any{"materials": []materialDTO{}})
		return
	}
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	if limit <= 0 {
		limit = 20
	}
	offset, _ := strconv.Atoi(q.Get("offset"))
	rows, total, err := h.materials.ListByStore(r.Context(), repository.MaterialListFilter{
		StoreID:         store.ID,
		Search:          q.Get("q"),
		Sort:            q.Get("sort"),
		IncludeInactive: q.Get("include_inactive") == "1",
		LowStockOnly:    q.Get("low_stock") == "1",
		Limit:           limit,
		Offset:          offset,
	})
	if err != nil {
		h.logger.Error("list materials", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	out := make([]materialDTO, 0, len(rows))
	for _, m := range rows {
		out = append(out, toMaterialDTO(m))
	}
	response.JSON(w, http.StatusOK, map[string]any{"materials": out, "total": total})
}

type materialReq struct {
	Name              string `json:"name"`
	Kind              string `json:"kind"`
	BaseUnit          string `json:"base_unit"`
	CostCents         int64  `json:"cost_cents"`
	LowStockThreshold int64  `json:"low_stock_threshold"`
}

func (req materialReq) toInput() (repository.MaterialInput, string) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return repository.MaterialInput{}, "nama bahan wajib diisi"
	}
	if strings.TrimSpace(req.BaseUnit) == "" {
		return repository.MaterialInput{}, "satuan wajib diisi"
	}
	kind := req.Kind
	if kind != "packaging" {
		kind = "ingredient"
	}
	if req.CostCents < 0 || req.LowStockThreshold < 0 {
		return repository.MaterialInput{}, "nilai tidak boleh negatif"
	}
	return repository.MaterialInput{
		Name: name, Kind: kind, BaseUnit: strings.TrimSpace(req.BaseUnit),
		CostCents: req.CostCents, LowStockThreshold: req.LowStockThreshold,
	}, ""
}

// POST /api/v1/materials
func (h *MaterialHandler) Create(w http.ResponseWriter, r *http.Request) {
	store, err := h.requireStore(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	var req materialReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	in, msg := req.toInput()
	if msg != "" {
		response.Error(w, http.StatusBadRequest, msg)
		return
	}
	m, err := h.materials.Create(r.Context(), store.ID, in)
	if err != nil {
		h.logger.Error("create material", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal menyimpan")
		return
	}
	h.audit.Log(r.Context(), store.ID, audit.Event{
		Action: "material.created", EntityType: "material", EntityID: m.ID.String(),
		Summary: "Tambah bahan " + m.Name,
	})
	response.JSON(w, http.StatusOK, map[string]any{"material": toMaterialDTO(*m)})
}

// PUT /api/v1/materials/{id}
func (h *MaterialHandler) Update(w http.ResponseWriter, r *http.Request) {
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
	var req materialReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	in, msg := req.toInput()
	if msg != "" {
		response.Error(w, http.StatusBadRequest, msg)
		return
	}
	m, err := h.materials.Update(r.Context(), store.ID, id, in)
	if errors.Is(err, repository.ErrMaterialNotFound) {
		response.Error(w, http.StatusNotFound, "bahan tidak ditemukan")
		return
	}
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "gagal menyimpan")
		return
	}
	h.audit.Log(r.Context(), store.ID, audit.Event{
		Action: "material.updated", EntityType: "material", EntityID: m.ID.String(),
		Summary: "Update bahan " + m.Name,
	})
	response.JSON(w, http.StatusOK, map[string]any{"material": toMaterialDTO(*m)})
}

// POST /api/v1/materials/{id}/restock  { quantity, cost_cents?, note }
func (h *MaterialHandler) Restock(w http.ResponseWriter, r *http.Request) {
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
	var req struct {
		Quantity  int64  `json:"quantity"`
		CostCents *int64 `json:"cost_cents"`
		Note      string `json:"note"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.Quantity <= 0 {
		response.Error(w, http.StatusBadRequest, "jumlah harus lebih dari 0")
		return
	}
	m, err := h.materials.Restock(r.Context(), store.ID, id, req.Quantity, req.CostCents, req.Note)
	if errors.Is(err, repository.ErrMaterialNotFound) {
		response.Error(w, http.StatusNotFound, "bahan tidak ditemukan")
		return
	}
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "gagal restock")
		return
	}
	h.audit.Log(r.Context(), store.ID, audit.Event{
		Action: "material.restocked", EntityType: "material", EntityID: m.ID.String(),
		Summary: "Restock bahan " + m.Name,
		Metadata: map[string]any{"quantity": req.Quantity},
	})
	response.JSON(w, http.StatusOK, map[string]any{"material": toMaterialDTO(*m)})
}

// POST /api/v1/materials/{id}/adjust  { stock, note }
func (h *MaterialHandler) Adjust(w http.ResponseWriter, r *http.Request) {
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
	var req struct {
		Stock int64  `json:"stock"`
		Note  string `json:"note"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	m, err := h.materials.Adjust(r.Context(), store.ID, id, req.Stock, req.Note)
	if errors.Is(err, repository.ErrMaterialNotFound) {
		response.Error(w, http.StatusNotFound, "bahan tidak ditemukan")
		return
	}
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "gagal menyesuaikan stok")
		return
	}
	h.audit.Log(r.Context(), store.ID, audit.Event{
		Action: "material.adjusted", EntityType: "material", EntityID: m.ID.String(),
		Summary: "Sesuaikan stok bahan " + m.Name,
	})
	response.JSON(w, http.StatusOK, map[string]any{"material": toMaterialDTO(*m)})
}

// DELETE /api/v1/materials/{id} (soft)
func (h *MaterialHandler) Delete(w http.ResponseWriter, r *http.Request) {
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
	if err := h.materials.SoftDelete(r.Context(), store.ID, id); err != nil {
		if errors.Is(err, repository.ErrMaterialNotFound) {
			response.Error(w, http.StatusNotFound, "bahan tidak ditemukan")
			return
		}
		response.Error(w, http.StatusInternalServerError, "gagal menghapus")
		return
	}
	h.audit.Log(r.Context(), store.ID, audit.Event{
		Action: "material.deleted", EntityType: "material", EntityID: id.String(),
		Summary: "Nonaktifkan bahan",
	})
	response.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

// reportRange parses ?from=&to= (YYYY-MM-DD) into a closed-open [from, to)
// window. Defaults to the last 30 days. `to` is made exclusive (end-of-day).
func reportRange(r *http.Request) (time.Time, time.Time) {
	q := r.URL.Query()
	now := time.Now()
	from := now.AddDate(0, 0, -29)
	to := now
	if s := q.Get("from"); s != "" {
		if t, err := time.Parse("2006-01-02", s); err == nil {
			from = t
		}
	}
	if s := q.Get("to"); s != "" {
		if t, err := time.Parse("2006-01-02", s); err == nil {
			to = t
		}
	}
	fromD := time.Date(from.Year(), from.Month(), from.Day(), 0, 0, 0, 0, time.UTC)
	toEx := time.Date(to.Year(), to.Month(), to.Day(), 0, 0, 0, 0, time.UTC).AddDate(0, 0, 1)
	return fromD, toEx
}

// proGate returns true (and writes 402) when the store is on the free plan.
// GET /api/v1/materials/summary — inventory valuation + low-stock count.
func (h *MaterialHandler) Summary(w http.ResponseWriter, r *http.Request) {
	store, err := h.requireStore(r)
	if errors.Is(err, repository.ErrStoreNotFound) {
		response.JSON(w, http.StatusOK, map[string]any{"item_count": 0, "total_value_cents": 0, "low_stock_count": 0})
		return
	}
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	s, err := h.materials.Summary(r.Context(), store.ID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{
		"item_count": s.ItemCount, "total_value_cents": s.TotalValueCents, "low_stock_count": s.LowStockCount,
	})
}

func (h *MaterialHandler) proBlocked(w http.ResponseWriter, r *http.Request, storeID uuid.UUID) bool {
	sub, err := h.subs.GetOrCreate(r.Context(), storeID)
	if err == nil && sub.Plan == "free" {
		response.JSON(w, http.StatusPaymentRequired, map[string]any{
			"error": "plan_required", "plan": "pro",
		})
		return true
	}
	return false
}

// GET /api/v1/materials/report?from=&to=
func (h *MaterialHandler) GetReport(w http.ResponseWriter, r *http.Request) {
	store, err := h.requireStore(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	if h.proBlocked(w, r, store.ID) {
		return
	}
	from, to := reportRange(r)
	rep, err := h.materials.GetConsumptionReport(r.Context(), store.ID, from, to)
	if err != nil {
		h.logger.Error("material report", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	byMat := make([]map[string]any, 0, len(rep.ByMaterial))
	for _, m := range rep.ByMaterial {
		byMat = append(byMat, map[string]any{
			"material_id": m.MaterialID.String(),
			"name":        m.Name,
			"base_unit":   m.BaseUnit,
			"kind":        m.Kind,
			"qty":         m.Qty,
			"cost_cents":  m.CostCents,
		})
	}
	daily := make([]map[string]any, 0, len(rep.DailySeries))
	for _, d := range rep.DailySeries {
		daily = append(daily, map[string]any{"date": d.Date, "cost_cents": d.CostCents})
	}
	response.JSON(w, http.StatusOK, map[string]any{"report": map[string]any{
		"total_cost_cents": rep.TotalCostCents,
		"by_material":      byMat,
		"daily_series":     daily,
	}})
}

// GET /api/v1/materials/report.csv?from=&to=
func (h *MaterialHandler) ExportReportCSV(w http.ResponseWriter, r *http.Request) {
	store, err := h.requireStore(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	if h.proBlocked(w, r, store.ID) {
		return
	}
	from, to := reportRange(r)
	rep, err := h.materials.GetConsumptionReport(r.Context(), store.ID, from, to)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="konsumsi-bahan-`+time.Now().Format("2006-01-02")+`.csv"`)
	cw := csv.NewWriter(w)
	defer cw.Flush()
	_ = cw.Write([]string{"Bahan", "Jenis", "Jumlah Terpakai", "Satuan", "Total Biaya (Rp)"})
	for _, m := range rep.ByMaterial {
		_ = cw.Write([]string{
			m.Name, m.Kind,
			strconv.FormatInt(m.Qty, 10), m.BaseUnit,
			strconv.FormatInt(m.CostCents/100, 10),
		})
	}
}

// GET /api/v1/materials/{id}/movements?limit=50
func (h *MaterialHandler) ListMovements(w http.ResponseWriter, r *http.Request) {
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
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	moves, err := h.materials.ListMovements(r.Context(), store.ID, id, limit)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	out := make([]map[string]any, 0, len(moves))
	for _, m := range moves {
		var orderID *string
		if m.OrderID != nil {
			s := m.OrderID.String()
			orderID = &s
		}
		out = append(out, map[string]any{
			"id":              m.ID.String(),
			"movement_type":   m.MovementType,
			"quantity":        m.Quantity,
			"unit_cost_cents": m.UnitCostCents,
			"order_id":        orderID,
			"note":            m.Note,
			"created_at":      m.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		})
	}
	response.JSON(w, http.StatusOK, map[string]any{"movements": out})
}
