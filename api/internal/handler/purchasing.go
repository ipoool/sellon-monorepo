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

type PurchasingHandler struct {
	suppliers  *repository.SupplierRepo
	pos        *repository.PurchaseOrderRepo
	stockTakes *repository.StockTakeRepo
	stores     *repository.StoreRepo
	subs       *repository.SubscriptionRepo
	audit      *audit.Logger
	logger     *slog.Logger
}

func NewPurchasingHandler(suppliers *repository.SupplierRepo, pos *repository.PurchaseOrderRepo, stockTakes *repository.StockTakeRepo, stores *repository.StoreRepo, subs *repository.SubscriptionRepo, audit *audit.Logger, logger *slog.Logger) *PurchasingHandler {
	return &PurchasingHandler{suppliers: suppliers, pos: pos, stockTakes: stockTakes, stores: stores, subs: subs, audit: audit, logger: logger}
}

func (h *PurchasingHandler) requireStore(r *http.Request) (*repository.Store, error) {
	uid, _ := auth.UserIDFromContext(r.Context())
	return h.stores.FindByOwnerID(r.Context(), uid)
}

func (h *PurchasingHandler) proBlocked(w http.ResponseWriter, r *http.Request, storeID uuid.UUID) bool {
	sub, err := h.subs.GetOrCreate(r.Context(), storeID)
	if err == nil && sub.Plan == "free" {
		response.JSON(w, http.StatusPaymentRequired, map[string]any{"error": "plan_required", "plan": "pro"})
		return true
	}
	return false
}

// ─── Suppliers ───────────────────────────────────────────────────────────────

type supplierDTO struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Phone string `json:"phone"`
	Note  string `json:"note"`
}

func (h *PurchasingHandler) ListSuppliers(w http.ResponseWriter, r *http.Request) {
	store, err := h.requireStore(r)
	if errors.Is(err, repository.ErrStoreNotFound) {
		response.JSON(w, http.StatusOK, map[string]any{"suppliers": []supplierDTO{}})
		return
	}
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	rows, err := h.suppliers.ListByStore(r.Context(), store.ID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	out := make([]supplierDTO, 0, len(rows))
	for _, s := range rows {
		out = append(out, supplierDTO{ID: s.ID.String(), Name: s.Name, Phone: s.Phone, Note: s.Note})
	}
	response.JSON(w, http.StatusOK, map[string]any{"suppliers": out})
}

type supplierInput struct {
	Name  string `json:"name"`
	Phone string `json:"phone"`
	Note  string `json:"note"`
}

func (h *PurchasingHandler) CreateSupplier(w http.ResponseWriter, r *http.Request) {
	store, err := h.requireStore(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	if h.proBlocked(w, r, store.ID) {
		return
	}
	var in supplierInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if strings.TrimSpace(in.Name) == "" {
		response.Error(w, http.StatusBadRequest, "nama supplier wajib")
		return
	}
	s, err := h.suppliers.Create(r.Context(), store.ID, strings.TrimSpace(in.Name), strings.TrimSpace(in.Phone), strings.TrimSpace(in.Note))
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	response.JSON(w, http.StatusCreated, map[string]any{"supplier": supplierDTO{ID: s.ID.String(), Name: s.Name, Phone: s.Phone, Note: s.Note}})
}

func (h *PurchasingHandler) UpdateSupplier(w http.ResponseWriter, r *http.Request) {
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
	var in supplierInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if err := h.suppliers.Update(r.Context(), store.ID, id, strings.TrimSpace(in.Name), strings.TrimSpace(in.Phone), strings.TrimSpace(in.Note)); err != nil {
		response.Error(w, http.StatusNotFound, "supplier tidak ditemukan")
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *PurchasingHandler) DeleteSupplier(w http.ResponseWriter, r *http.Request) {
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
	if err := h.suppliers.SoftDelete(r.Context(), store.ID, id); err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ─── Purchase Orders ─────────────────────────────────────────────────────────

type poDTO struct {
	ID           string  `json:"id"`
	SupplierID   string  `json:"supplier_id"`
	SupplierName string  `json:"supplier_name"`
	Status       string  `json:"status"`
	Note         string  `json:"note"`
	TotalCents   int64   `json:"total_cents"`
	ItemCount    int     `json:"item_count"`
	OrderedAt    *string `json:"ordered_at"`
	ReceivedAt   *string `json:"received_at"`
	CreatedAt    string  `json:"created_at"`
}

func toPODTO(p repository.PurchaseOrder) poDTO {
	var orderedAt, receivedAt *string
	if p.OrderedAt != nil {
		s := p.OrderedAt.Format("2006-01-02T15:04:05Z07:00")
		orderedAt = &s
	}
	if p.ReceivedAt != nil {
		s := p.ReceivedAt.Format("2006-01-02T15:04:05Z07:00")
		receivedAt = &s
	}
	sid := ""
	if p.SupplierID != nil {
		sid = p.SupplierID.String()
	}
	return poDTO{
		ID: p.ID.String(), SupplierID: sid, SupplierName: p.SupplierName,
		Status: p.Status, Note: p.Note, TotalCents: p.TotalCents, ItemCount: p.ItemCount,
		OrderedAt: orderedAt, ReceivedAt: receivedAt,
		CreatedAt: p.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
}

func (h *PurchasingHandler) ListPOs(w http.ResponseWriter, r *http.Request) {
	store, err := h.requireStore(r)
	if errors.Is(err, repository.ErrStoreNotFound) {
		response.JSON(w, http.StatusOK, map[string]any{"purchase_orders": []poDTO{}})
		return
	}
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	rows, err := h.pos.ListByStore(r.Context(), store.ID, r.URL.Query().Get("status"))
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	out := make([]poDTO, 0, len(rows))
	for _, p := range rows {
		out = append(out, toPODTO(p))
	}
	response.JSON(w, http.StatusOK, map[string]any{"purchase_orders": out})
}

func (h *PurchasingHandler) GetPO(w http.ResponseWriter, r *http.Request) {
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
	po, items, err := h.pos.Get(r.Context(), store.ID, id)
	if errors.Is(err, repository.ErrPONotFound) {
		response.Error(w, http.StatusNotFound, "PO tidak ditemukan")
		return
	}
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	itemsOut := make([]map[string]any, 0, len(items))
	for _, it := range items {
		itemsOut = append(itemsOut, map[string]any{
			"id": it.ID.String(), "material_id": it.MaterialID.String(),
			"material_name": it.MaterialName, "base_unit": it.BaseUnit,
			"quantity": it.Quantity, "unit_cost_cents": it.UnitCostCents,
		})
	}
	response.JSON(w, http.StatusOK, map[string]any{"purchase_order": toPODTO(*po), "items": itemsOut})
}

type poInput struct {
	SupplierID string `json:"supplier_id"`
	Note       string `json:"note"`
	Items      []struct {
		MaterialID    string `json:"material_id"`
		Quantity      int64  `json:"quantity"`
		UnitCostCents int64  `json:"unit_cost_cents"`
	} `json:"items"`
}

func (h *PurchasingHandler) CreatePO(w http.ResponseWriter, r *http.Request) {
	store, err := h.requireStore(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	if h.proBlocked(w, r, store.ID) {
		return
	}
	var in poInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	var supplierID *uuid.UUID
	if strings.TrimSpace(in.SupplierID) != "" {
		sid, perr := uuid.Parse(in.SupplierID)
		if perr != nil {
			response.Error(w, http.StatusBadRequest, "supplier_id invalid")
			return
		}
		supplierID = &sid
	}
	items := make([]repository.POItemInput, 0, len(in.Items))
	for _, it := range in.Items {
		mid, perr := uuid.Parse(it.MaterialID)
		if perr != nil || it.Quantity <= 0 {
			continue
		}
		items = append(items, repository.POItemInput{
			MaterialID: mid, Quantity: it.Quantity, UnitCostCents: maxInt64(0, it.UnitCostCents),
		})
	}
	if len(items) == 0 {
		response.Error(w, http.StatusBadRequest, "minimal 1 item bahan")
		return
	}
	poID, err := h.pos.Create(r.Context(), store.ID, supplierID, in.Note, items)
	if err != nil {
		h.logger.Error("create PO", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal buat PO")
		return
	}
	h.audit.Log(r.Context(), store.ID, audit.Event{
		Action: "purchase_order.created", EntityType: "purchase_order", EntityID: poID.String(),
		Summary: "Buat purchase order",
	})
	response.JSON(w, http.StatusCreated, map[string]any{"id": poID.String()})
}

func (h *PurchasingHandler) SetPOStatus(w http.ResponseWriter, r *http.Request) {
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
	var body struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if err := h.pos.SetStatus(r.Context(), store.ID, id, body.Status); err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *PurchasingHandler) ReceivePO(w http.ResponseWriter, r *http.Request) {
	store, err := h.requireStore(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	if h.proBlocked(w, r, store.ID) {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "id invalid")
		return
	}
	if err := h.pos.Receive(r.Context(), store.ID, id); err != nil {
		if errors.Is(err, repository.ErrPONotReceivable) {
			response.Error(w, http.StatusConflict, "PO sudah diterima atau dibatalkan")
			return
		}
		if errors.Is(err, repository.ErrPONotFound) {
			response.Error(w, http.StatusNotFound, "PO tidak ditemukan")
			return
		}
		h.logger.Error("receive PO", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal terima PO")
		return
	}
	h.audit.Log(r.Context(), store.ID, audit.Event{
		Action: "purchase_order.received", EntityType: "purchase_order", EntityID: id.String(),
		Summary: "Terima purchase order (restock)",
	})
	response.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

func maxInt64(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}

// ─── Stock Opname ────────────────────────────────────────────────────────────

func (h *PurchasingHandler) ListStockTakes(w http.ResponseWriter, r *http.Request) {
	store, err := h.requireStore(r)
	if errors.Is(err, repository.ErrStoreNotFound) {
		response.JSON(w, http.StatusOK, map[string]any{"stock_takes": []map[string]any{}})
		return
	}
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	rows, err := h.stockTakes.ListByStore(r.Context(), store.ID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	out := make([]map[string]any, 0, len(rows))
	for _, s := range rows {
		var postedAt *string
		if s.PostedAt != nil {
			t := s.PostedAt.Format("2006-01-02T15:04:05Z07:00")
			postedAt = &t
		}
		out = append(out, map[string]any{
			"id": s.ID.String(), "status": s.Status, "note": s.Note,
			"item_count": s.ItemCount, "posted_at": postedAt,
			"created_at": s.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		})
	}
	response.JSON(w, http.StatusOK, map[string]any{"stock_takes": out})
}

func (h *PurchasingHandler) CreateStockTake(w http.ResponseWriter, r *http.Request) {
	store, err := h.requireStore(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	if h.proBlocked(w, r, store.ID) {
		return
	}
	var body struct {
		Note string `json:"note"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	id, err := h.stockTakes.Create(r.Context(), store.ID, strings.TrimSpace(body.Note))
	if err != nil {
		h.logger.Error("create stock take", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal buat opname")
		return
	}
	response.JSON(w, http.StatusCreated, map[string]any{"id": id.String()})
}

func (h *PurchasingHandler) GetStockTake(w http.ResponseWriter, r *http.Request) {
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
	st, items, err := h.stockTakes.Get(r.Context(), store.ID, id)
	if errors.Is(err, repository.ErrStockTakeNotFound) {
		response.Error(w, http.StatusNotFound, "opname tidak ditemukan")
		return
	}
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	itemsOut := make([]map[string]any, 0, len(items))
	for _, it := range items {
		itemsOut = append(itemsOut, map[string]any{
			"id": it.ID.String(), "material_id": it.MaterialID.String(),
			"material_name": it.MaterialName, "base_unit": it.BaseUnit,
			"system_qty": it.SystemQty, "counted_qty": it.CountedQty,
		})
	}
	var postedAt *string
	if st.PostedAt != nil {
		t := st.PostedAt.Format("2006-01-02T15:04:05Z07:00")
		postedAt = &t
	}
	response.JSON(w, http.StatusOK, map[string]any{
		"stock_take": map[string]any{
			"id": st.ID.String(), "status": st.Status, "note": st.Note,
			"posted_at": postedAt,
			"created_at": st.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		},
		"items": itemsOut,
	})
}

func (h *PurchasingHandler) PostStockTake(w http.ResponseWriter, r *http.Request) {
	store, err := h.requireStore(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	if h.proBlocked(w, r, store.ID) {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "id invalid")
		return
	}
	var body struct {
		Counts []struct {
			ItemID     string `json:"item_id"`
			CountedQty int64  `json:"counted_qty"`
		} `json:"counts"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	counts := make(map[uuid.UUID]int64, len(body.Counts))
	for _, c := range body.Counts {
		itemID, perr := uuid.Parse(c.ItemID)
		if perr != nil {
			continue
		}
		counts[itemID] = maxInt64(0, c.CountedQty)
	}
	if err := h.stockTakes.Post(r.Context(), store.ID, id, counts); err != nil {
		if errors.Is(err, repository.ErrStockTakePosted) {
			response.Error(w, http.StatusConflict, "opname sudah diposting")
			return
		}
		if errors.Is(err, repository.ErrStockTakeNotFound) {
			response.Error(w, http.StatusNotFound, "opname tidak ditemukan")
			return
		}
		h.logger.Error("post stock take", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal posting opname")
		return
	}
	h.audit.Log(r.Context(), store.ID, audit.Event{
		Action: "stock_take.posted", EntityType: "stock_take", EntityID: id.String(),
		Summary: "Posting stok opname",
	})
	response.JSON(w, http.StatusOK, map[string]any{"ok": true})
}
