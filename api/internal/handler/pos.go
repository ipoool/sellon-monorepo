package handler

import (
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/sellon/sellon/api/internal/audit"
	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/notify"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

type POSHandler struct {
	pos         *repository.POSRepo
	stores      *repository.StoreRepo
	products    *repository.ProductRepo
	variants    *repository.VariantRepo
	orders      *repository.OrderRepo
	customers   *repository.CustomerRepo
	memberships *repository.MembershipRepo
	subs        *repository.SubscriptionRepo
	waTemplates *repository.WATemplateRepo
	users          *repository.UserRepo
	modifiers      *repository.ModifierRepo
	materials      *repository.MaterialRepo
	membershipTier *repository.MembershipTierRepo
	twilio         *notify.Twilio
	audit          *audit.Logger
	logger         *slog.Logger
}

func NewPOSHandler(
	pos *repository.POSRepo,
	stores *repository.StoreRepo,
	products *repository.ProductRepo,
	variants *repository.VariantRepo,
	orders *repository.OrderRepo,
	customers *repository.CustomerRepo,
	memberships *repository.MembershipRepo,
	subs *repository.SubscriptionRepo,
	waTemplates *repository.WATemplateRepo,
	users *repository.UserRepo,
	modifiers *repository.ModifierRepo,
	materials *repository.MaterialRepo,
	membershipTier *repository.MembershipTierRepo,
	twilio *notify.Twilio,
	auditLog *audit.Logger,
	logger *slog.Logger,
) *POSHandler {
	return &POSHandler{
		pos:            pos,
		stores:         stores,
		products:       products,
		variants:       variants,
		orders:         orders,
		customers:      customers,
		memberships:    memberships,
		subs:           subs,
		waTemplates:    waTemplates,
		users:          users,
		modifiers:      modifiers,
		materials:      materials,
		membershipTier: membershipTier,
		twilio:         twilio,
		audit:          auditLog,
		logger:         logger,
	}
}

// posContext resolves the store for the authenticated user. Unlike most
// dashboard handlers (which use FindByOwnerID and only succeed for owners),
// POS allows owner/admin/staff via the membership table.
type posContext struct {
	storeID uuid.UUID
	userID  uuid.UUID
	role    repository.Role
}

func (h *POSHandler) ctx(w http.ResponseWriter, r *http.Request) *posContext {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		response.Error(w, http.StatusUnauthorized, "unauthorized")
		return nil
	}
	// Find the store the user is a member of (owner first, then any other
	// membership). Staff/admin only get added to one store via invites.
	storeID, role, err := h.memberships.GetUserStoreRole(r.Context(), userID)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "kamu belum tergabung di toko manapun")
		return nil
	}
	return &posContext{storeID: storeID, userID: userID, role: role}
}

func (h *POSHandler) requireProPlan(w http.ResponseWriter, r *http.Request, storeID uuid.UUID) bool {
	sub, err := h.subs.GetOrCreate(r.Context(), storeID)
	if err != nil {
		return true // fail-open
	}
	if sub.Plan != "pro" && sub.Plan != "bisnis" {
		response.Error(w, http.StatusPaymentRequired,
			"Fitur Kasir POS hanya tersedia untuk plan Pro dan Bisnis. Upgrade sekarang untuk membuka fitur ini.")
		return false
	}
	return true
}

// ─── Sessions ────────────────────────────────────────────────────────────────

func (h *POSHandler) OpenSession(w http.ResponseWriter, r *http.Request) {
	c := h.ctx(w, r)
	if c == nil {
		return
	}
	if !h.requireProPlan(w, r, c.storeID) {
		return
	}
	var body struct {
		OpeningCashCents int64  `json:"opening_cash_cents"`
		Notes            string `json:"notes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if body.OpeningCashCents < 0 {
		response.Error(w, http.StatusBadRequest, "kas awal tidak boleh negatif")
		return
	}
	sess, err := h.pos.OpenSession(r.Context(), c.storeID, c.userID, body.OpeningCashCents, body.Notes)
	if errors.Is(err, repository.ErrPOSSessionExists) {
		response.Error(w, http.StatusConflict, err.Error())
		return
	}
	if err != nil {
		h.logger.Error("pos: open session", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	h.audit.Log(r.Context(), c.storeID, audit.Event{
		Action: "pos.session.opened", EntityType: "pos_session", EntityID: sess.ID.String(),
		Summary: fmt.Sprintf("Buka shift kasir, kas awal Rp %d", sess.OpeningCashCents/100),
	})
	response.JSON(w, http.StatusCreated, map[string]any{"session": sessionToDTO(sess)})
}

func (h *POSHandler) GetActiveSession(w http.ResponseWriter, r *http.Request) {
	c := h.ctx(w, r)
	if c == nil {
		return
	}
	sess, err := h.pos.GetActiveSessionForUser(r.Context(), c.storeID, c.userID)
	if errors.Is(err, repository.ErrPOSSessionNotFound) {
		response.JSON(w, http.StatusOK, map[string]any{"session": nil})
		return
	}
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"session": sessionToDTO(sess)})
}

func (h *POSHandler) ListSessions(w http.ResponseWriter, r *http.Request) {
	c := h.ctx(w, r)
	if c == nil {
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 || limit > 100 {
		limit = 30
	}
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))

	filter := repository.ListSessionsFilter{
		StoreID: c.storeID,
		Limit:   limit,
		Offset:  offset,
		Status:  r.URL.Query().Get("status"),
	}
	if v := r.URL.Query().Get("cashier_id"); v != "" {
		if cid, err := uuid.Parse(v); err == nil {
			filter.CashierID = &cid
		}
	}
	if v := r.URL.Query().Get("from"); v != "" {
		if t, err := time.Parse("2006-01-02", v); err == nil {
			filter.From = &t
		}
	}
	if v := r.URL.Query().Get("to"); v != "" {
		if t, err := time.Parse("2006-01-02", v); err == nil {
			next := t.AddDate(0, 0, 1)
			filter.To = &next
		}
	}

	sessions, total, err := h.pos.ListSessionsFiltered(r.Context(), filter)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	out := make([]any, 0, len(sessions))
	for _, s := range sessions {
		out = append(out, sessionToDTO(&s))
	}
	response.JSON(w, http.StatusOK, map[string]any{"sessions": out, "total": total})
}

// ListSessionOrders — orders dalam shift untuk session detail page.
func (h *POSHandler) ListSessionOrders(w http.ResponseWriter, r *http.Request) {
	c := h.ctx(w, r)
	if c == nil {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	orders, err := h.pos.ListOrdersBySession(r.Context(), id, c.storeID)
	if errors.Is(err, repository.ErrPOSSessionNotFound) {
		response.Error(w, http.StatusNotFound, "sesi tidak ditemukan")
		return
	}
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	out := make([]any, 0, len(orders))
	for _, o := range orders {
		out = append(out, sessionOrderToDTO(&o))
	}
	response.JSON(w, http.StatusOK, map[string]any{"orders": out})
}

// ExportSessionOrdersCSV — download CSV transaksi dalam shift.
func (h *POSHandler) ExportSessionOrdersCSV(w http.ResponseWriter, r *http.Request) {
	c := h.ctx(w, r)
	if c == nil {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	orders, err := h.pos.ListOrdersBySession(r.Context(), id, c.storeID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="shift-%s.csv"`, id.String()[:8]))
	cw := csv.NewWriter(w)
	defer cw.Flush()
	_ = cw.Write([]string{
		"Waktu", "No. Order", "Status", "Pelanggan", "WhatsApp",
		"Subtotal", "Diskon", "Total", "Kembalian", "Metode", "Catatan",
	})
	for _, o := range orders {
		_ = cw.Write([]string{
			o.CreatedAt.Format("2006-01-02 15:04:05"),
			o.OrderNumber,
			o.Status,
			o.CustomerName,
			o.CustomerWA,
			strconv.FormatInt(o.SubtotalCents/100, 10),
			strconv.FormatInt(o.DiscountCents/100, 10),
			strconv.FormatInt(o.TotalCents/100, 10),
			strconv.FormatInt(o.ChangeCents/100, 10),
			o.PaymentMethod,
			o.Notes,
		})
	}
}

// ReturnOrder — full return: cancel + restock + record refund.
func (h *POSHandler) ReturnOrder(w http.ResponseWriter, r *http.Request) {
	c := h.ctx(w, r)
	if c == nil {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	var body struct {
		Reason string `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if strings.TrimSpace(body.Reason) == "" {
		response.Error(w, http.StatusBadRequest, "alasan retur wajib diisi")
		return
	}
	if err := h.pos.ReturnOrder(r.Context(), id, c.storeID, body.Reason); err != nil {
		if errors.Is(err, repository.ErrOrderNotFound) {
			response.Error(w, http.StatusNotFound, "pesanan tidak ditemukan")
			return
		}
		if errors.Is(err, repository.ErrPOSOrderNotVoidable) {
			response.Error(w, http.StatusBadRequest, "pesanan tidak bisa di-retur (hanya order POS yang completed)")
			return
		}
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	h.audit.Log(r.Context(), c.storeID, audit.Event{
		Action: "pos.order.returned", EntityType: "order", EntityID: id.String(),
		Summary: "Retur POS: " + body.Reason,
	})
	response.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ListCashiers — cashier yang punya activity di store, untuk filter dropdown.
func (h *POSHandler) ListCashiers(w http.ResponseWriter, r *http.Request) {
	c := h.ctx(w, r)
	if c == nil {
		return
	}
	cashiers, err := h.pos.ListCashiers(r.Context(), c.storeID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	out := make([]any, 0, len(cashiers))
	for _, c := range cashiers {
		name := c.Name
		if name == "" {
			name = c.Email
		}
		out = append(out, map[string]any{
			"user_id": c.UserID,
			"name":    name,
			"email":   c.Email,
		})
	}
	response.JSON(w, http.StatusOK, map[string]any{"cashiers": out})
}

// GetReport — POS metrics with filters.
func (h *POSHandler) GetReport(w http.ResponseWriter, r *http.Request) {
	c := h.ctx(w, r)
	if c == nil {
		return
	}
	f := repository.POSReportFilter{StoreID: c.storeID}
	if v := r.URL.Query().Get("cashier_id"); v != "" {
		if cid, err := uuid.Parse(v); err == nil {
			f.CashierID = &cid
		}
	}
	if v := r.URL.Query().Get("from"); v != "" {
		if t, err := time.Parse("2006-01-02", v); err == nil {
			f.From = &t
		}
	}
	if v := r.URL.Query().Get("to"); v != "" {
		if t, err := time.Parse("2006-01-02", v); err == nil {
			next := t.AddDate(0, 0, 1)
			f.To = &next
		}
	}
	report, err := h.pos.GetPOSReport(r.Context(), f)
	if err != nil {
		h.logger.Error("pos: get report", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"report": reportToDTO(report)})
}

// ExportReportCSV — POS report sebagai CSV (daily series).
func (h *POSHandler) ExportReportCSV(w http.ResponseWriter, r *http.Request) {
	c := h.ctx(w, r)
	if c == nil {
		return
	}
	f := repository.POSReportFilter{StoreID: c.storeID}
	if v := r.URL.Query().Get("cashier_id"); v != "" {
		if cid, err := uuid.Parse(v); err == nil {
			f.CashierID = &cid
		}
	}
	if v := r.URL.Query().Get("from"); v != "" {
		if t, err := time.Parse("2006-01-02", v); err == nil {
			f.From = &t
		}
	}
	if v := r.URL.Query().Get("to"); v != "" {
		if t, err := time.Parse("2006-01-02", v); err == nil {
			next := t.AddDate(0, 0, 1)
			f.To = &next
		}
	}
	report, err := h.pos.GetPOSReport(r.Context(), f)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="laporan-pos.csv"`)
	cw := csv.NewWriter(w)
	defer cw.Flush()
	_ = cw.Write([]string{"Tanggal", "Jumlah Transaksi", "Total Penjualan"})
	for _, d := range report.DailySeries {
		_ = cw.Write([]string{
			d.Date,
			strconv.Itoa(d.OrderCount),
			strconv.FormatInt(d.TotalCents/100, 10),
		})
	}
	_ = cw.Write([]string{})
	_ = cw.Write([]string{"Ringkasan", "", ""})
	_ = cw.Write([]string{"Total Order", strconv.Itoa(report.OrderCount), ""})
	_ = cw.Write([]string{"Total Penjualan", strconv.FormatInt(report.TotalGross/100, 10), ""})
	_ = cw.Write([]string{"Total Diretur", strconv.FormatInt(report.TotalRefunded/100, 10), ""})
	_ = cw.Write([]string{"Tunai", strconv.FormatInt(report.TotalCash/100, 10), ""})
	_ = cw.Write([]string{"QRIS", strconv.FormatInt(report.TotalQRIS/100, 10), ""})
	_ = cw.Write([]string{"Transfer", strconv.FormatInt(report.TotalTransfer/100, 10), ""})
	_ = cw.Write([]string{"Midtrans", strconv.FormatInt(report.TotalMidtrans/100, 10), ""})
}

func (h *POSHandler) GetSession(w http.ResponseWriter, r *http.Request) {
	c := h.ctx(w, r)
	if c == nil {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	sess, err := h.pos.GetSessionByID(r.Context(), id, c.storeID)
	if errors.Is(err, repository.ErrPOSSessionNotFound) {
		response.Error(w, http.StatusNotFound, "sesi tidak ditemukan")
		return
	}
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"session": sessionToDTO(sess)})
}

func (h *POSHandler) GetSessionSummary(w http.ResponseWriter, r *http.Request) {
	c := h.ctx(w, r)
	if c == nil {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	summary, err := h.pos.GetSummary(r.Context(), id, c.storeID)
	if errors.Is(err, repository.ErrPOSSessionNotFound) {
		response.Error(w, http.StatusNotFound, "sesi tidak ditemukan")
		return
	}
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"summary": summaryToDTO(summary)})
}

func (h *POSHandler) CloseSession(w http.ResponseWriter, r *http.Request) {
	c := h.ctx(w, r)
	if c == nil {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	var body struct {
		ClosingCashCents int64 `json:"closing_cash_cents"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if body.ClosingCashCents < 0 {
		response.Error(w, http.StatusBadRequest, "kas akhir tidak boleh negatif")
		return
	}
	if err := h.pos.CloseSession(r.Context(), id, c.storeID, c.userID, body.ClosingCashCents); err != nil {
		if errors.Is(err, repository.ErrPOSSessionNotFound) {
			response.Error(w, http.StatusNotFound, "sesi tidak ditemukan")
			return
		}
		if errors.Is(err, repository.ErrPOSSessionNotOpen) {
			response.Error(w, http.StatusBadRequest, "sesi sudah ditutup")
			return
		}
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	h.audit.Log(r.Context(), c.storeID, audit.Event{
		Action: "pos.session.closed", EntityType: "pos_session", EntityID: id.String(),
		Summary: fmt.Sprintf("Tutup shift kasir, kas akhir Rp %d", body.ClosingCashCents/100),
	})
	response.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ─── Cash movements ──────────────────────────────────────────────────────────

func (h *POSHandler) AddCashMovement(w http.ResponseWriter, r *http.Request) {
	c := h.ctx(w, r)
	if c == nil {
		return
	}
	sessionID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	var body struct {
		Type        string `json:"type"`
		AmountCents int64  `json:"amount_cents"`
		Reason      string `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if strings.TrimSpace(body.Reason) == "" {
		response.Error(w, http.StatusBadRequest, "alasan wajib diisi")
		return
	}
	m, err := h.pos.AddCashMovement(r.Context(), sessionID, c.storeID, c.userID, body.Type, body.AmountCents, body.Reason)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	action := "pos.cash_in"
	if body.Type == "out" {
		action = "pos.cash_out"
	}
	h.audit.Log(r.Context(), c.storeID, audit.Event{
		Action: action, EntityType: "pos_cash_movement", EntityID: m.ID.String(),
		Summary: fmt.Sprintf("%s Rp %d — %s", body.Type, body.AmountCents/100, body.Reason),
	})
	response.JSON(w, http.StatusCreated, map[string]any{"movement": movementToDTO(m)})
}

func (h *POSHandler) ListCashMovements(w http.ResponseWriter, r *http.Request) {
	c := h.ctx(w, r)
	if c == nil {
		return
	}
	sessionID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	// Verify session belongs to this store
	if _, err := h.pos.GetSessionByID(r.Context(), sessionID, c.storeID); err != nil {
		response.Error(w, http.StatusNotFound, "sesi tidak ditemukan")
		return
	}
	movements, err := h.pos.ListCashMovements(r.Context(), sessionID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	out := make([]any, 0, len(movements))
	for _, m := range movements {
		out = append(out, movementToDTO(&m))
	}
	response.JSON(w, http.StatusOK, map[string]any{"movements": out})
}

// ─── POS Orders ──────────────────────────────────────────────────────────────

func (h *POSHandler) CreatePOSOrder(w http.ResponseWriter, r *http.Request) {
	c := h.ctx(w, r)
	if c == nil {
		return
	}
	if !h.requireProPlan(w, r, c.storeID) {
		return
	}

	var body struct {
		SessionID     string `json:"session_id"`
		CustomerName  string `json:"customer_name"`
		CustomerWA    string `json:"customer_wa"`
		DiscountType  string `json:"discount_type"`
		DiscountValue int64  `json:"discount_value"`
		RedeemPoints  int    `json:"redeem_points"`
		Notes         string `json:"notes"`
		Items         []struct {
			ProductID         string   `json:"product_id"`
			VariantID         *string  `json:"variant_id"`
			Quantity          int      `json:"quantity"`
			UnitCents         int64    `json:"unit_cents"`
			ProductName       string   `json:"product_name"`
			VariantName       string   `json:"variant_name"`
			ProductType       string   `json:"product_type"`
			SelectedOptionIDs []string `json:"selected_option_ids"`
			ServingType       string   `json:"serving_type"`
		} `json:"items"`
		Payments []struct {
			Method          string `json:"method"`
			AmountCents     int64  `json:"amount_cents"`
			CardBrand       string `json:"card_brand"`
			CardLast4       string `json:"card_last4"`
			ReferenceNumber string `json:"reference_number"`
			ApprovalCode    string `json:"approval_code"`
		} `json:"payments"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}

	sessionID, err := uuid.Parse(body.SessionID)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "session_id tidak valid")
		return
	}

	items := make([]repository.POSOrderItem, 0, len(body.Items))
	for _, it := range body.Items {
		pid, err := uuid.Parse(it.ProductID)
		if err != nil {
			response.Error(w, http.StatusBadRequest, "product_id tidak valid")
			return
		}
		if it.Quantity <= 0 {
			response.Error(w, http.StatusBadRequest, "quantity harus > 0")
			return
		}
		productID := pid
		servingType := ""
		if it.ServingType == "dine_in" || it.ServingType == "takeaway" {
			servingType = it.ServingType
		}
		item := repository.POSOrderItem{
			ProductID:   &productID,
			Quantity:    it.Quantity,
			UnitCents:   it.UnitCents,
			ProductName: it.ProductName,
			VariantName: it.VariantName,
			ProductType: it.ProductType,
			ServingType: servingType,
		}
		if it.VariantID != nil && *it.VariantID != "" {
			vid, err := uuid.Parse(*it.VariantID)
			if err != nil {
				response.Error(w, http.StatusBadRequest, "variant_id tidak valid")
				return
			}
			item.VariantID = &vid
		}
		// Validate + snapshot selected options. POS keeps client unit_cents
		// (which already includes the option price deltas).
		if len(it.SelectedOptionIDs) > 0 {
			optIDs := make([]uuid.UUID, 0, len(it.SelectedOptionIDs))
			for _, s := range it.SelectedOptionIDs {
				oid, perr := uuid.Parse(s)
				if perr != nil {
					response.Error(w, http.StatusBadRequest, "opsi tidak valid")
					return
				}
				optIDs = append(optIDs, oid)
			}
			_, snaps, serr := h.modifiers.ResolveSelection(r.Context(), pid, optIDs)
			if serr != nil {
				response.Error(w, http.StatusBadRequest, serr.Error())
				return
			}
			item.Modifiers = snaps
		}
		items = append(items, item)

		// Take-away packaging: read the product's config server-side (never
		// trust a client-sent charge) and append a separate billable line that
		// consumes the linked material. Qty mirrors the food line.
		if servingType == "takeaway" {
			p, perr := h.products.FindByID(r.Context(), c.storeID, pid)
			if perr == nil && p.TakeawayEnabled &&
				(p.TakeawayChargeCents > 0 || p.TakeawayMaterialID != nil) {
				label := "Take Away"
				if p.TakeawayMaterialID != nil {
					if names, _ := h.materials.NamesByIDs(r.Context(), c.storeID, []uuid.UUID{*p.TakeawayMaterialID}); names[*p.TakeawayMaterialID] != "" {
						label = names[*p.TakeawayMaterialID]
					}
				}
				items = append(items, repository.POSOrderItem{
					ProductID:           nil,
					Quantity:            it.Quantity,
					UnitCents:           p.TakeawayChargeCents,
					ProductName:         label,
					ProductType:         "physical",
					PackagingMaterialID: p.TakeawayMaterialID,
				})
			}
		}
	}

	payments := make([]repository.POSPayment, 0, len(body.Payments))
	for _, p := range body.Payments {
		switch p.Method {
		case "cash", "qris", "manual_transfer", "midtrans", "edc_debit", "edc_kredit":
		default:
			response.Error(w, http.StatusBadRequest, "metode pembayaran tidak valid: "+p.Method)
			return
		}
		// EDC needs at least reference number for audit.
		if (p.Method == "edc_debit" || p.Method == "edc_kredit") && strings.TrimSpace(p.ReferenceNumber) == "" {
			response.Error(w, http.StatusBadRequest, "Nomor referensi EDC wajib diisi")
			return
		}
		payments = append(payments, repository.POSPayment{
			Method:          p.Method,
			AmountCents:     p.AmountCents,
			CardBrand:       p.CardBrand,
			CardLast4:       p.CardLast4,
			ReferenceNumber: p.ReferenceNumber,
			ApprovalCode:    p.ApprovalCode,
		})
	}

	result, err := h.pos.CreatePOSOrder(r.Context(), repository.CreatePOSOrderInput{
		StoreID:       c.storeID,
		SessionID:     sessionID,
		CashierID:     c.userID,
		CustomerName:  body.CustomerName,
		CustomerWA:    body.CustomerWA,
		Items:         items,
		Payments:      payments,
		DiscountType:  body.DiscountType,
		DiscountValue: body.DiscountValue,
		RedeemPoints:  body.RedeemPoints,
		Notes:         body.Notes,
	})
	if errors.Is(err, repository.ErrPOSPaymentShort) {
		response.Error(w, http.StatusBadRequest, "Total pembayaran kurang dari total transaksi")
		return
	}
	if errors.Is(err, repository.ErrStockInsufficient) {
		response.Error(w, http.StatusConflict, "Stok salah satu produk tidak cukup")
		return
	}
	if errors.Is(err, repository.ErrInsufficientPoints) {
		response.Error(w, http.StatusBadRequest, "Poin pembeli tidak cukup untuk redeem")
		return
	}
	if errors.Is(err, repository.ErrPOSSessionNotFound) || errors.Is(err, repository.ErrPOSSessionNotOpen) {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	if err != nil {
		h.logger.Error("pos: create order", "err", err)
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.audit.Log(r.Context(), c.storeID, audit.Event{
		Action: "pos.order.created", EntityType: "order", EntityID: result.OrderID.String(),
		Summary: fmt.Sprintf("Transaksi POS #%s — Rp %d", result.OrderNumber, result.TotalCents/100),
	})

	response.JSON(w, http.StatusCreated, map[string]any{
		"order_id":            result.OrderID,
		"order_number":        result.OrderNumber,
		"subtotal_cents":      result.SubtotalCents,
		"discount_cents":      result.DiscountCents,
		"total_cents":         result.TotalCents,
		"payment_method":      result.PaymentMethod,
		"change_amount_cents": result.ChangeAmountCents,
		"created_at":          result.CreatedAt,
		"points_earned":       result.PointsEarned,
		"points_redeemed":     result.PointsRedeemed,
	})
}

func (h *POSHandler) VoidOrder(w http.ResponseWriter, r *http.Request) {
	c := h.ctx(w, r)
	if c == nil {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	var body struct {
		Reason string `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if strings.TrimSpace(body.Reason) == "" {
		response.Error(w, http.StatusBadRequest, "alasan void wajib diisi")
		return
	}
	if err := h.pos.VoidPOSOrder(r.Context(), id, c.storeID, body.Reason); err != nil {
		if errors.Is(err, repository.ErrOrderNotFound) {
			response.Error(w, http.StatusNotFound, "pesanan tidak ditemukan")
			return
		}
		if errors.Is(err, repository.ErrPOSOrderNotVoidable) {
			response.Error(w, http.StatusBadRequest, "transaksi tidak bisa di-void (hanya order POS dalam shift aktif)")
			return
		}
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	h.audit.Log(r.Context(), c.storeID, audit.Event{
		Action: "pos.order.voided", EntityType: "order", EntityID: id.String(),
		Summary: "Void transaksi POS: " + body.Reason,
	})
	response.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

// SendReceiptWA mengirim struk POS ke nomor WhatsApp pembeli via Twilio.
func (h *POSHandler) SendReceiptWA(w http.ResponseWriter, r *http.Request) {
	c := h.ctx(w, r)
	if c == nil {
		return
	}
	orderID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	var body struct {
		Phone string `json:"phone"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	phone := strings.TrimSpace(body.Phone)
	if phone == "" {
		response.Error(w, http.StatusBadRequest, "nomor WhatsApp wajib diisi")
		return
	}
	// Get order + items + payments
	order, err := h.orders.FindByID(r.Context(), c.storeID, orderID)
	if err != nil || order == nil {
		response.Error(w, http.StatusNotFound, "pesanan tidak ditemukan")
		return
	}
	items, err := h.orders.ListItems(r.Context(), orderID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	payments, _ := h.pos.GetOrderPayments(r.Context(), orderID)
	mods, _ := h.orders.ListModifiersByOrder(r.Context(), orderID)

	store, _ := h.stores.FindByID(r.Context(), c.storeID)
	storeName := ""
	if store != nil {
		storeName = store.Name
	}

	body2 := buildReceiptText(storeName, order, items, payments, mods)

	// Normalize phone to E.164.
	e164 := normalizePhoneE164(phone)
	if err := h.twilio.SendWhatsApp(r.Context(), e164, body2); err != nil {
		h.logger.Error("pos: send receipt WA", "err", err)
		response.Error(w, http.StatusBadGateway, "gagal kirim WhatsApp: "+err.Error())
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ─── Held orders ─────────────────────────────────────────────────────────────

func (h *POSHandler) CreateHeldOrder(w http.ResponseWriter, r *http.Request) {
	c := h.ctx(w, r)
	if c == nil {
		return
	}
	var body struct {
		SessionID    string          `json:"session_id"`
		Label        string          `json:"label"`
		CartSnapshot json.RawMessage `json:"cart_snapshot"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	sessionID, err := uuid.Parse(body.SessionID)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "session_id tidak valid")
		return
	}
	if len(body.CartSnapshot) == 0 {
		response.Error(w, http.StatusBadRequest, "cart kosong")
		return
	}
	held, err := h.pos.CreateHeldOrder(r.Context(), c.storeID, sessionID, c.userID, body.Label, body.CartSnapshot)
	if err != nil {
		h.logger.Error("pos: create held", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	response.JSON(w, http.StatusCreated, map[string]any{"held": heldToDTO(held)})
}

func (h *POSHandler) ListHeldOrders(w http.ResponseWriter, r *http.Request) {
	c := h.ctx(w, r)
	if c == nil {
		return
	}
	sessionIDStr := r.URL.Query().Get("session_id")
	sessionID, err := uuid.Parse(sessionIDStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "session_id tidak valid")
		return
	}
	// Verify session belongs to this store
	if _, err := h.pos.GetSessionByID(r.Context(), sessionID, c.storeID); err != nil {
		response.Error(w, http.StatusNotFound, "sesi tidak ditemukan")
		return
	}
	held, err := h.pos.ListHeldOrders(r.Context(), sessionID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	out := make([]any, 0, len(held))
	for _, h := range held {
		out = append(out, heldToDTO(&h))
	}
	response.JSON(w, http.StatusOK, map[string]any{"held": out})
}

func (h *POSHandler) DeleteHeldOrder(w http.ResponseWriter, r *http.Request) {
	c := h.ctx(w, r)
	if c == nil {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.pos.DeleteHeldOrder(r.Context(), id, c.storeID); err != nil {
		if errors.Is(err, repository.ErrPOSHeldNotFound) {
			response.Error(w, http.StatusNotFound, "tidak ditemukan")
			return
		}
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ─── DTOs ────────────────────────────────────────────────────────────────────

func sessionToDTO(s *repository.POSSession) map[string]any {
	return map[string]any{
		"id":                  s.ID,
		"store_id":            s.StoreID,
		"opened_by":           s.OpenedBy,
		"opened_by_name":      s.OpenedByName,
		"closed_by":           s.ClosedBy,
		"closed_by_name":      s.ClosedByName,
		"opening_cash_cents":  s.OpeningCashCents,
		"closing_cash_cents":  s.ClosingCashCents,
		"expected_cash_cents": s.ExpectedCashCents,
		"notes":               s.Notes,
		"status":              s.Status,
		"opened_at":           s.OpenedAt,
		"closed_at":           s.ClosedAt,
	}
}

func summaryToDTO(s *repository.POSSessionSummary) map[string]any {
	return map[string]any{
		"session":          sessionToDTO(s.Session),
		"total_sales":      s.TotalSales,
		"total_cash":       s.TotalCash,
		"total_qris":       s.TotalQRIS,
		"total_transfer":   s.TotalTransfer,
		"total_midtrans":   s.TotalMidtrans,
		"total_edc_debit":  s.TotalEDCDebit,
		"total_edc_kredit": s.TotalEDCKredit,
		"total_cash_in":    s.TotalCashIn,
		"total_cash_out":   s.TotalCashOut,
		"order_count":      s.OrderCount,
		"expected_cash":    s.ExpectedCash,
	}
}

func movementToDTO(m *repository.POSCashMovement) map[string]any {
	return map[string]any{
		"id":           m.ID,
		"type":         m.Type,
		"amount_cents": m.AmountCents,
		"reason":       m.Reason,
		"created_at":   m.CreatedAt,
	}
}

func heldToDTO(h *repository.POSHeldOrder) map[string]any {
	return map[string]any{
		"id":            h.ID,
		"label":         h.Label,
		"cart_snapshot": json.RawMessage(h.CartSnapshot),
		"created_at":    h.CreatedAt,
	}
}

func sessionOrderToDTO(o *repository.POSSessionOrder) map[string]any {
	payments := make([]map[string]any, 0, len(o.Payments))
	for _, p := range o.Payments {
		payments = append(payments, map[string]any{
			"method":           p.Method,
			"amount_cents":     p.AmountCents,
			"card_brand":       p.CardBrand,
			"card_last4":       p.CardLast4,
			"reference_number": p.ReferenceNumber,
			"approval_code":    p.ApprovalCode,
		})
	}
	return map[string]any{
		"order_id":            o.OrderID,
		"order_number":        o.OrderNumber,
		"status":              o.Status,
		"payment_method":      o.PaymentMethod,
		"subtotal_cents":      o.SubtotalCents,
		"discount_cents":      o.DiscountCents,
		"total_cents":         o.TotalCents,
		"change_amount_cents": o.ChangeCents,
		"customer_name":       o.CustomerName,
		"customer_wa":         o.CustomerWA,
		"notes":               o.Notes,
		"created_at":          o.CreatedAt,
		"item_count":          o.ItemCount,
		"payments":            payments,
		"refunded_at":         o.RefundedAt,
		"refund_reason":       o.RefundReason,
	}
}

func reportToDTO(r *repository.POSReportMetrics) map[string]any {
	daily := make([]map[string]any, 0, len(r.DailySeries))
	for _, d := range r.DailySeries {
		daily = append(daily, map[string]any{
			"date":        d.Date,
			"order_count": d.OrderCount,
			"total_cents": d.TotalCents,
		})
	}
	top := make([]map[string]any, 0, len(r.TopProducts))
	for _, p := range r.TopProducts {
		top = append(top, map[string]any{
			"product_id":   p.ProductID,
			"product_name": p.ProductName,
			"quantity":     p.Quantity,
			"total_cents":  p.TotalCents,
		})
	}
	byCashier := make([]map[string]any, 0, len(r.ByCashier))
	for _, c := range r.ByCashier {
		byCashier = append(byCashier, map[string]any{
			"cashier_id":   c.CashierID,
			"cashier_name": c.CashierName,
			"order_count":  c.OrderCount,
			"total_cents":  c.TotalCents,
		})
	}
	return map[string]any{
		"order_count":      r.OrderCount,
		"total_gross":      r.TotalGross,
		"total_refunded":   r.TotalRefunded,
		"avg_transaction": r.AvgTransaction,
		"total_cash":       r.TotalCash,
		"total_qris":       r.TotalQRIS,
		"total_transfer":   r.TotalTransfer,
		"total_midtrans":   r.TotalMidtrans,
		"total_edc_debit":  r.TotalEDCDebit,
		"total_edc_kredit": r.TotalEDCKredit,
		"daily_series":     daily,
		"top_products":     top,
		"by_cashier":       byCashier,
	}
}

// ─── Receipt helpers ─────────────────────────────────────────────────────────

func buildReceiptText(storeName string, order *repository.Order, items []repository.OrderItem, payments []repository.POSPayment, mods map[uuid.UUID][]repository.OptionSnapshot) string {
	var sb strings.Builder
	if storeName != "" {
		sb.WriteString("*" + storeName + "*\n")
	}
	sb.WriteString("Struk #" + order.OrderNumber + "\n")
	sb.WriteString("───────────────\n")
	for _, it := range items {
		line := it.ProductName
		if it.VariantName != "" {
			line += " (" + it.VariantName + ")"
		}
		switch it.ServingType {
		case "dine_in":
			line += " [Dine In]"
		case "takeaway":
			line += " [Take Away]"
		}
		sb.WriteString(fmt.Sprintf("%s\n  %dx Rp %s = Rp %s\n",
			line, it.Quantity, formatRp(it.UnitPriceCents), formatRp(it.SubtotalCents)))
		for _, m := range mods[it.ID] {
			sb.WriteString("  + " + m.OptionName + "\n")
		}
	}
	sb.WriteString("───────────────\n")
	sb.WriteString(fmt.Sprintf("Subtotal: Rp %s\n", formatRp(order.SubtotalCents)))
	if order.DiscountCents > 0 {
		sb.WriteString(fmt.Sprintf("Diskon: -Rp %s\n", formatRp(order.DiscountCents)))
	}
	sb.WriteString(fmt.Sprintf("*TOTAL: Rp %s*\n", formatRp(order.TotalCents)))
	sb.WriteString("───────────────\n")
	for _, p := range payments {
		sb.WriteString(fmt.Sprintf("%s: Rp %s\n", methodLabel(p.Method), formatRp(p.AmountCents)))
	}
	// change is order-level, not per payment
	// We'd ideally include change_amount_cents but it's not in OrderItem struct
	sb.WriteString("\nTerima kasih sudah berbelanja! 🙏")
	return sb.String()
}

func methodLabel(m string) string {
	switch m {
	case "cash":
		return "Tunai"
	case "qris":
		return "QRIS"
	case "manual_transfer":
		return "Transfer"
	case "midtrans":
		return "Midtrans"
	case "edc_debit":
		return "EDC Debit"
	case "edc_kredit":
		return "EDC Kredit"
	}
	return m
}

func formatRp(cents int64) string {
	rp := cents / 100
	s := strconv.FormatInt(rp, 10)
	// Insert thousand separators (Indonesian: dot)
	n := len(s)
	if n <= 3 {
		return s
	}
	var b strings.Builder
	first := n % 3
	if first == 0 {
		first = 3
	}
	b.WriteString(s[:first])
	for i := first; i < n; i += 3 {
		b.WriteByte('.')
		b.WriteString(s[i : i+3])
	}
	return b.String()
}

func normalizePhoneE164(p string) string {
	p = strings.TrimSpace(p)
	// Remove non-digit chars except leading +.
	var out strings.Builder
	for i, ch := range p {
		if i == 0 && ch == '+' {
			out.WriteRune(ch)
			continue
		}
		if ch >= '0' && ch <= '9' {
			out.WriteRune(ch)
		}
	}
	s := out.String()
	if strings.HasPrefix(s, "+") {
		return s
	}
	// Indonesian: 08xx → +628xx, 8xx → +628xx
	if strings.HasPrefix(s, "0") {
		return "+62" + s[1:]
	}
	if strings.HasPrefix(s, "62") {
		return "+" + s
	}
	return "+62" + s
}

// GET /api/v1/pos/members/resolve/{code} — scan a member card.
func (h *POSHandler) ResolveMember(w http.ResponseWriter, r *http.Request) {
	c := h.ctx(w, r)
	if c == nil {
		return
	}
	code := strings.ToUpper(strings.TrimSpace(chi.URLParam(r, "code")))
	if code == "" {
		response.Error(w, http.StatusBadRequest, "kode kosong")
		return
	}
	cust, err := h.customers.FindByMemberCode(r.Context(), c.storeID, code)
	if err != nil {
		response.Error(w, http.StatusNotFound, "kartu member tidak ditemukan")
		return
	}
	out := map[string]any{
		"id":              cust.ID.String(),
		"name":            cust.Name,
		"whatsapp_number": cust.WhatsAppNumber,
		"loyalty_points":  cust.LoyaltyPoints,
		"total_orders":    cust.TotalOrders,
		"member_code":     cust.MemberCode,
	}
	if tiers, terr := h.membershipTier.ListByStore(r.Context(), c.storeID); terr == nil {
		if tier := repository.ResolveTier(tiers, cust.TotalSpentCents); tier != nil {
			out["tier_name"] = tier.Name
			out["point_multiplier"] = tier.PointMultiplier
			out["discount_percent"] = tier.DiscountPercent
		}
	}
	response.JSON(w, http.StatusOK, map[string]any{"member": out})
}

// ─── Loyalty handlers ────────────────────────────────────────────────────────

func (h *POSHandler) GetLoyaltyConfig(w http.ResponseWriter, r *http.Request) {
	c := h.ctx(w, r)
	if c == nil {
		return
	}
	cfg, err := h.pos.GetLoyaltyConfig(r.Context(), c.storeID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"config": map[string]any{
		"enabled":           cfg.Enabled,
		"earn_rate_cents":   cfg.EarnRateCents,
		"redeem_rate_cents": cfg.RedeemRateCents,
	}})
}

func (h *POSHandler) UpdateLoyaltyConfig(w http.ResponseWriter, r *http.Request) {
	c := h.ctx(w, r)
	if c == nil {
		return
	}
	if !h.requireProPlan(w, r, c.storeID) {
		return
	}
	var body struct {
		Enabled         bool  `json:"enabled"`
		EarnRateCents   int64 `json:"earn_rate_cents"`
		RedeemRateCents int64 `json:"redeem_rate_cents"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if err := h.pos.UpdateLoyaltyConfig(r.Context(), c.storeID, repository.LoyaltyConfig{
		Enabled:         body.Enabled,
		EarnRateCents:   body.EarnRateCents,
		RedeemRateCents: body.RedeemRateCents,
	}); err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	h.audit.Log(r.Context(), c.storeID, audit.Event{
		Action: "loyalty.config_updated", EntityType: "store", EntityID: c.storeID.String(),
		Summary: fmt.Sprintf("enabled=%v earn=%d redeem=%d", body.Enabled, body.EarnRateCents, body.RedeemRateCents),
	})
	response.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *POSHandler) GetPrinterConfig(w http.ResponseWriter, r *http.Request) {
	c := h.ctx(w, r)
	if c == nil {
		return
	}
	cfg, err := h.pos.GetPrinterConfig(r.Context(), c.storeID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"config": map[string]any{
		"method":      cfg.Method,
		"paper_width": cfg.PaperWidth,
		"auto_print":  cfg.AutoPrint,
		"copies":      cfg.Copies,
		"header":      cfg.Header,
		"footer":      cfg.Footer,
	}})
}

func (h *POSHandler) UpdatePrinterConfig(w http.ResponseWriter, r *http.Request) {
	c := h.ctx(w, r)
	if c == nil {
		return
	}
	var body struct {
		Method     string `json:"method"`
		PaperWidth string `json:"paper_width"`
		AutoPrint  bool   `json:"auto_print"`
		Copies     int    `json:"copies"`
		Header     string `json:"header"`
		Footer     string `json:"footer"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if len(body.Header) > 200 || len(body.Footer) > 200 {
		response.Error(w, http.StatusBadRequest, "teks header/footer terlalu panjang (maks 200 karakter)")
		return
	}
	if err := h.pos.UpdatePrinterConfig(r.Context(), c.storeID, repository.PrinterConfig{
		Method:     body.Method,
		PaperWidth: body.PaperWidth,
		AutoPrint:  body.AutoPrint,
		Copies:     body.Copies,
		Header:     body.Header,
		Footer:     body.Footer,
	}); err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	h.audit.Log(r.Context(), c.storeID, audit.Event{
		Action: "printer.config_updated", EntityType: "store", EntityID: c.storeID.String(),
		Summary: fmt.Sprintf("method=%s paper=%s auto=%v copies=%d", body.Method, body.PaperWidth, body.AutoPrint, body.Copies),
	})
	response.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *POSHandler) LookupCustomer(w http.ResponseWriter, r *http.Request) {
	c := h.ctx(w, r)
	if c == nil {
		return
	}
	phone := strings.TrimSpace(r.URL.Query().Get("phone"))
	if phone == "" {
		response.Error(w, http.StatusBadRequest, "phone wajib diisi")
		return
	}
	cust, err := h.pos.LookupCustomerByPhone(r.Context(), c.storeID, phone)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	if cust == nil {
		response.JSON(w, http.StatusOK, map[string]any{"customer": nil})
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"customer": map[string]any{
		"id":                cust.ID,
		"name":              cust.Name,
		"whatsapp_number":   cust.WhatsApp,
		"loyalty_points":    cust.LoyaltyPoints,
		"total_orders":      cust.TotalOrders,
		"total_spent_cents": cust.TotalSpentCents,
	}})
}

// SearchCustomers untuk POS picker modal — search by name OR phone.
func (h *POSHandler) SearchCustomers(w http.ResponseWriter, r *http.Request) {
	c := h.ctx(w, r)
	if c == nil {
		return
	}
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 {
		limit = 10
	}
	customers, err := h.pos.SearchCustomersForPOS(r.Context(), c.storeID, q, limit)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	out := make([]any, 0, len(customers))
	for _, cust := range customers {
		out = append(out, map[string]any{
			"id":                cust.ID,
			"name":              cust.Name,
			"whatsapp_number":   cust.WhatsApp,
			"loyalty_points":    cust.LoyaltyPoints,
			"total_orders":      cust.TotalOrders,
			"total_spent_cents": cust.TotalSpentCents,
		})
	}
	response.JSON(w, http.StatusOK, map[string]any{"customers": out})
}

func (h *POSHandler) ListLoyaltyTransactions(w http.ResponseWriter, r *http.Request) {
	c := h.ctx(w, r)
	if c == nil {
		return
	}
	customerID, err := uuid.Parse(chi.URLParam(r, "customerID"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	txs, err := h.pos.ListLoyaltyTransactions(r.Context(), customerID, c.storeID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	out := make([]any, 0, len(txs))
	for _, t := range txs {
		out = append(out, map[string]any{
			"id":            t.ID,
			"order_id":      t.OrderID,
			"type":          t.Type,
			"points":        t.Points,
			"balance_after": t.BalanceAfter,
			"reason":        t.Reason,
			"created_at":    t.CreatedAt,
		})
	}
	response.JSON(w, http.StatusOK, map[string]any{"transactions": out})
}
