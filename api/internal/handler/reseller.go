package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/audit"
	"github.com/sellon/sellon/api/internal/email"
	"github.com/sellon/sellon/api/internal/notify"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

type ResellerHandler struct {
	reseller *repository.ResellerRepo
	stores   *repository.StoreRepo
	subs     *repository.SubscriptionRepo
	audit    *audit.Logger
	mailer   *email.Mailer
	twilio   *notify.Twilio
	logger   *slog.Logger
}

func NewResellerHandler(
	reseller *repository.ResellerRepo,
	stores *repository.StoreRepo,
	subs *repository.SubscriptionRepo,
	audit *audit.Logger,
	mailer *email.Mailer,
	twilio *notify.Twilio,
	logger *slog.Logger,
) *ResellerHandler {
	return &ResellerHandler{
		reseller: reseller,
		stores:   stores,
		subs:     subs,
		audit:    audit,
		mailer:   mailer,
		twilio:   twilio,
		logger:   logger,
	}
}

// requireStore resolves the authenticated user's store. Returns nil and writes
// an error response if the store cannot be found.
func (h *ResellerHandler) requireStore(w http.ResponseWriter, r *http.Request) *repository.Store {
	uid, _ := auth.UserIDFromContext(r.Context())
	store, err := h.stores.FindByOwnerID(r.Context(), uid)
	if err != nil || store == nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return nil
	}
	return store
}

// requireProPlan checks that the store's subscription is Pro or Bisnis.
func (h *ResellerHandler) requireProPlan(w http.ResponseWriter, r *http.Request, storeID uuid.UUID) bool {
	sub, err := h.subs.GetOrCreate(r.Context(), storeID)
	if err != nil {
		return true // fail-open
	}
	if sub.Plan != "pro" && sub.Plan != "bisnis" {
		response.Error(w, http.StatusPaymentRequired,
			"Fitur Program Reseller hanya tersedia untuk plan Pro dan Bisnis. Upgrade sekarang untuk membuka fitur ini.")
		return false
	}
	return true
}

// ─── Supplier: program CRUD ───────────────────────────────────────────────────

func (h *ResellerHandler) CreateProgram(w http.ResponseWriter, r *http.Request) {
	store := h.requireStore(w, r)
	if store == nil {
		return
	}
	if !h.requireProPlan(w, r, store.ID) {
		return
	}

	var body struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if strings.TrimSpace(body.Name) == "" {
		response.Error(w, http.StatusBadRequest, "nama program wajib diisi")
		return
	}

	prog, err := h.reseller.CreateProgram(r.Context(), store.ID, body.Name, body.Description)
	if err != nil {
		h.logger.Error("reseller: create program", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	h.audit.Log(r.Context(), store.ID, audit.Event{Action: "reseller_program_created", EntityType: "reseller_program", EntityID: prog.ID.String(), Summary: prog.Name})
	response.JSON(w, http.StatusCreated, map[string]any{"program": programToDTO(prog)})
}

func (h *ResellerHandler) ListMyPrograms(w http.ResponseWriter, r *http.Request) {
	store := h.requireStore(w, r)
	if store == nil {
		return
	}
	programs, err := h.reseller.ListProgramsBySupplier(r.Context(), store.ID)
	if err != nil {
		h.logger.Error("reseller: list programs", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	out := make([]any, 0, len(programs))
	for _, p := range programs {
		out = append(out, programToDTO(&p))
	}
	response.JSON(w, http.StatusOK, map[string]any{"programs": out})
}

func (h *ResellerHandler) GetProgram(w http.ResponseWriter, r *http.Request) {
	store := h.requireStore(w, r)
	if store == nil {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	prog, err := h.reseller.GetProgramByID(r.Context(), id, store.ID)
	if errors.Is(err, repository.ErrResellerProgramNotFound) {
		response.Error(w, http.StatusNotFound, "program tidak ditemukan")
		return
	}
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"program": programToDTO(prog)})
}

func (h *ResellerHandler) UpdateProgram(w http.ResponseWriter, r *http.Request) {
	store := h.requireStore(w, r)
	if store == nil {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	var body struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		IsActive    bool   `json:"is_active"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if strings.TrimSpace(body.Name) == "" {
		response.Error(w, http.StatusBadRequest, "nama program wajib diisi")
		return
	}
	if err := h.reseller.UpdateProgram(r.Context(), id, store.ID, body.Name, body.Description, body.IsActive); err != nil {
		if errors.Is(err, repository.ErrResellerProgramNotFound) {
			response.Error(w, http.StatusNotFound, "program tidak ditemukan")
			return
		}
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *ResellerHandler) RegenerateInviteCode(w http.ResponseWriter, r *http.Request) {
	store := h.requireStore(w, r)
	if store == nil {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	code, err := h.reseller.RegenerateInviteCode(r.Context(), id, store.ID)
	if errors.Is(err, repository.ErrResellerProgramNotFound) {
		response.Error(w, http.StatusNotFound, "program tidak ditemukan")
		return
	}
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	h.audit.Log(r.Context(), store.ID, audit.Event{Action: "reseller_invite_code_regenerated", EntityType: "reseller_program", EntityID: id.String()})
	response.JSON(w, http.StatusOK, map[string]any{"invite_code": code})
}

// ─── Supplier: program products ───────────────────────────────────────────────

func (h *ResellerHandler) SetProgramProducts(w http.ResponseWriter, r *http.Request) {
	store := h.requireStore(w, r)
	if store == nil {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}

	var body struct {
		Products []struct {
			ProductID           string `json:"product_id"`
			ResellerPriceCents  int64  `json:"reseller_price_cents"`
			IsActive            bool   `json:"is_active"`
		} `json:"products"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}

	inputs := make([]repository.ProgramProductInput, 0, len(body.Products))
	for _, p := range body.Products {
		pid, err := uuid.Parse(p.ProductID)
		if err != nil {
			response.Error(w, http.StatusBadRequest, "product_id tidak valid")
			return
		}
		if p.ResellerPriceCents < 0 {
			response.Error(w, http.StatusBadRequest, "harga reseller tidak boleh negatif")
			return
		}
		inputs = append(inputs, repository.ProgramProductInput{
			ProductID:          pid,
			ResellerPriceCents: p.ResellerPriceCents,
			IsActive:           p.IsActive,
		})
	}

	if err := h.reseller.SetProgramProducts(r.Context(), id, inputs); err != nil {
		h.logger.Error("reseller: set program products", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *ResellerHandler) ListProgramProducts(w http.ResponseWriter, r *http.Request) {
	store := h.requireStore(w, r)
	if store == nil {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	products, err := h.reseller.ListProgramProducts(r.Context(), id)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	out := make([]any, 0, len(products))
	for _, p := range products {
		out = append(out, programProductToDTO(&p))
	}
	response.JSON(w, http.StatusOK, map[string]any{"products": out})
}

func (h *ResellerHandler) ListProgramMembers(w http.ResponseWriter, r *http.Request) {
	store := h.requireStore(w, r)
	if store == nil {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	members, err := h.reseller.ListProgramMembers(r.Context(), id)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	out := make([]any, 0, len(members))
	for _, m := range members {
		out = append(out, membershipToDTO(&m))
	}
	response.JSON(w, http.StatusOK, map[string]any{"members": out})
}

// ─── Supplier: fulfill dropship orders ───────────────────────────────────────

func (h *ResellerHandler) ListSupplierOrders(w http.ResponseWriter, r *http.Request) {
	store := h.requireStore(w, r)
	if store == nil {
		return
	}
	items, err := h.reseller.ListSupplierDropshipOrders(r.Context(), store.ID)
	if err != nil {
		h.logger.Error("reseller: list supplier orders", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	out := make([]any, 0, len(items))
	for _, d := range items {
		out = append(out, dropshipOrderItemToDTO(&d))
	}
	response.JSON(w, http.StatusOK, map[string]any{"orders": out})
}

func (h *ResellerHandler) MarkDropshipShipped(w http.ResponseWriter, r *http.Request) {
	store := h.requireStore(w, r)
	if store == nil {
		return
	}
	itemID, err := uuid.Parse(chi.URLParam(r, "orderItemID"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	var body struct {
		TrackingNumber string `json:"tracking_number"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if strings.TrimSpace(body.TrackingNumber) == "" {
		response.Error(w, http.StatusBadRequest, "nomor resi wajib diisi")
		return
	}
	if err := h.reseller.MarkDropshipShipped(r.Context(), itemID, store.ID, body.TrackingNumber); err != nil {
		if errors.Is(err, repository.ErrResellerCatalogNotFound) {
			response.Error(w, http.StatusNotFound, "item tidak ditemukan")
			return
		}
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	h.audit.Log(r.Context(), store.ID, audit.Event{Action: "dropship_item_shipped", EntityType: "order_item", EntityID: itemID.String(), Summary: body.TrackingNumber})
	response.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ─── Reseller: join & memberships ────────────────────────────────────────────

func (h *ResellerHandler) JoinProgram(w http.ResponseWriter, r *http.Request) {
	store := h.requireStore(w, r)
	if store == nil {
		return
	}
	var body struct {
		InviteCode string `json:"invite_code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if strings.TrimSpace(body.InviteCode) == "" {
		response.Error(w, http.StatusBadRequest, "kode undangan wajib diisi")
		return
	}

	membership, err := h.reseller.JoinProgram(r.Context(), store.ID, body.InviteCode)
	if errors.Is(err, repository.ErrResellerProgramNotFound) {
		response.Error(w, http.StatusNotFound, "kode undangan tidak ditemukan atau sudah tidak aktif")
		return
	}
	if err != nil {
		if strings.Contains(err.Error(), "toko sendiri") {
			response.Error(w, http.StatusBadRequest, err.Error())
			return
		}
		h.logger.Error("reseller: join program", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	h.audit.Log(r.Context(), store.ID, audit.Event{Action: "reseller_program_joined", EntityType: "reseller_membership", EntityID: membership.ID.String(), Summary: membership.ProgramName})
	response.JSON(w, http.StatusCreated, map[string]any{"membership": membershipToDTO(membership)})
}

// PreviewInviteCode returns program info without joining — used by FE to show
// a preview before the user confirms.
func (h *ResellerHandler) PreviewInviteCode(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("code")
	if code == "" {
		response.Error(w, http.StatusBadRequest, "kode wajib diisi")
		return
	}
	prog, err := h.reseller.GetProgramByInviteCode(r.Context(), code)
	if errors.Is(err, repository.ErrResellerProgramNotFound) {
		response.Error(w, http.StatusNotFound, "kode undangan tidak ditemukan")
		return
	}
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{
		"program": map[string]any{
			"name":          prog.Name,
			"description":   prog.Description,
			"supplier_name": prog.SupplierStoreName,
			"product_count": prog.ProductCount,
		},
	})
}

func (h *ResellerHandler) ListMemberships(w http.ResponseWriter, r *http.Request) {
	store := h.requireStore(w, r)
	if store == nil {
		return
	}
	memberships, err := h.reseller.ListMemberships(r.Context(), store.ID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	out := make([]any, 0, len(memberships))
	for _, m := range memberships {
		out = append(out, membershipToDTO(&m))
	}
	response.JSON(w, http.StatusOK, map[string]any{"memberships": out})
}

func (h *ResellerHandler) ListAvailableProducts(w http.ResponseWriter, r *http.Request) {
	h.requireStore(w, r) // just auth check
	mid, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	products, err := h.reseller.ListAvailableProducts(r.Context(), mid)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	out := make([]any, 0, len(products))
	for _, p := range products {
		out = append(out, programProductToDTO(&p))
	}
	response.JSON(w, http.StatusOK, map[string]any{"products": out})
}

// ─── Reseller: catalog ───────────────────────────────────────────────────────

func (h *ResellerHandler) ImportProduct(w http.ResponseWriter, r *http.Request) {
	store := h.requireStore(w, r)
	if store == nil {
		return
	}
	var body struct {
		MembershipID       string `json:"membership_id"`
		ProgramProductID   string `json:"program_product_id"`
		ResellerPriceCents int64  `json:"reseller_price_cents"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	mid, err := uuid.Parse(body.MembershipID)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "membership_id tidak valid")
		return
	}
	ppid, err := uuid.Parse(body.ProgramProductID)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "program_product_id tidak valid")
		return
	}
	entry, err := h.reseller.ImportProduct(r.Context(), mid, ppid, body.ResellerPriceCents)
	if errors.Is(err, repository.ErrPriceBelowModal) {
		response.Error(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	if errors.Is(err, repository.ErrResellerProgramNotFound) {
		response.Error(w, http.StatusNotFound, "produk program tidak ditemukan atau tidak aktif")
		return
	}
	if err != nil {
		h.logger.Error("reseller: import product", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	h.audit.Log(r.Context(), store.ID, audit.Event{Action: "reseller_product_imported", EntityType: "reseller_catalog", EntityID: entry.ID.String(), Summary: entry.ProductName})
	response.JSON(w, http.StatusCreated, map[string]any{"entry": catalogEntryToDTO(entry)})
}

func (h *ResellerHandler) ListCatalog(w http.ResponseWriter, r *http.Request) {
	store := h.requireStore(w, r)
	if store == nil {
		return
	}
	entries, err := h.reseller.ListCatalog(r.Context(), store.ID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	out := make([]any, 0, len(entries))
	for _, e := range entries {
		out = append(out, catalogEntryToDTO(&e))
	}
	response.JSON(w, http.StatusOK, map[string]any{"catalog": out})
}

func (h *ResellerHandler) UpdateCatalogPrice(w http.ResponseWriter, r *http.Request) {
	store := h.requireStore(w, r)
	if store == nil {
		return
	}
	cid, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	var body struct {
		ResellerPriceCents int64 `json:"reseller_price_cents"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if err := h.reseller.UpdateCatalogPrice(r.Context(), cid, store.ID, body.ResellerPriceCents); err != nil {
		if errors.Is(err, repository.ErrPriceBelowModal) {
			response.Error(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		if errors.Is(err, repository.ErrResellerCatalogNotFound) {
			response.Error(w, http.StatusNotFound, "item tidak ditemukan")
			return
		}
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *ResellerHandler) RemoveFromCatalog(w http.ResponseWriter, r *http.Request) {
	store := h.requireStore(w, r)
	if store == nil {
		return
	}
	cid, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.reseller.RemoveFromCatalog(r.Context(), cid, store.ID); err != nil {
		if errors.Is(err, repository.ErrResellerCatalogNotFound) {
			response.Error(w, http.StatusNotFound, "item tidak ditemukan")
			return
		}
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	h.audit.Log(r.Context(), store.ID, audit.Event{Action: "reseller_product_removed", EntityType: "reseller_catalog", EntityID: cid.String()})
	response.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ─── DTOs ─────────────────────────────────────────────────────────────────────

func programToDTO(p *repository.ResellerProgram) map[string]any {
	return map[string]any{
		"id":                  p.ID,
		"supplier_store_id":   p.SupplierStoreID,
		"supplier_store_name": p.SupplierStoreName,
		"name":                p.Name,
		"description":         p.Description,
		"invite_code":         p.InviteCode,
		"is_active":           p.IsActive,
		"member_count":        p.MemberCount,
		"product_count":       p.ProductCount,
		"created_at":          p.CreatedAt,
		"updated_at":          p.UpdatedAt,
	}
}

func programProductToDTO(p *repository.ProgramProduct) map[string]any {
	photos := p.PhotoURLs
	if photos == nil {
		photos = []string{}
	}
	return map[string]any{
		"id":                   p.ID,
		"program_id":           p.ProgramID,
		"product_id":           p.ProductID,
		"reseller_price_cents": p.ResellerPriceCents,
		"is_active":            p.IsActive,
		"product_name":         p.ProductName,
		"product_slug":         p.ProductSlug,
		"photo_urls":           photos,
		"stock":                p.Stock,
		"product_status":       p.ProductStatus,
		"created_at":           p.CreatedAt,
		"updated_at":           p.UpdatedAt,
	}
}

func membershipToDTO(m *repository.ResellerMembership) map[string]any {
	return map[string]any{
		"id":                  m.ID,
		"program_id":          m.ProgramID,
		"reseller_store_id":   m.ResellerStoreID,
		"is_active":           m.IsActive,
		"joined_at":           m.JoinedAt,
		"program_name":        m.ProgramName,
		"supplier_store_id":   m.SupplierStoreID,
		"supplier_store_name": m.SupplierStoreName,
		"product_count":       m.ProductCount,
	}
}

func catalogEntryToDTO(e *repository.ResellerCatalogEntry) map[string]any {
	photos := e.PhotoURLs
	if photos == nil {
		photos = []string{}
	}
	return map[string]any{
		"id":                   e.ID,
		"membership_id":        e.MembershipID,
		"program_product_id":   e.ProgramProductID,
		"reseller_price_cents": e.ResellerPriceCents,
		"modal_cents":          e.ModalCents,
		"is_active":            e.IsActive,
		"product_id":           e.ProductID,
		"product_name":         e.ProductName,
		"product_slug":         e.ProductSlug,
		"photo_urls":           photos,
		"stock":                e.Stock,
		"supplier_store_id":    e.SupplierStoreID,
		"supplier_store_name":  e.SupplierStoreName,
		"created_at":           e.CreatedAt,
		"updated_at":           e.UpdatedAt,
	}
}

func dropshipOrderItemToDTO(d *repository.DropshipOrderItem) map[string]any {
	return map[string]any{
		"order_item_id":       d.OrderItemID,
		"order_id":            d.OrderID,
		"order_number":        d.OrderNumber,
		"order_created_at":    d.OrderCreatedAt,
		"product_name":        d.ProductName,
		"variant_name":        d.VariantName,
		"quantity":            d.Quantity,
		"unit_price_cents":    d.UnitPriceCents,
		"reseller_cost_cents": d.ResellerCostCents,
		"subtotal_cents":      d.SubtotalCents,
		"customer_name":       d.CustomerName,
		"customer_wa":         d.CustomerWA,
		"customer_address":    d.CustomerAddress,
		"customer_city":       d.CustomerCity,
		"tracking_number":     d.TrackingNumber,
		"shipped_at":          d.ShippedAt,
		"reseller_store_name": d.ResellerStoreName,
	}
}
