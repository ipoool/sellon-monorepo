package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ─── Errors ──────────────────────────────────────────────────────────────────

var (
	ErrPOSSessionNotFound = errors.New("sesi kasir tidak ditemukan")
	ErrPOSSessionNotOpen  = errors.New("sesi kasir sudah ditutup")
	ErrPOSSessionExists   = errors.New("kamu sudah punya sesi kasir yang aktif — tutup dulu sebelum buka baru")
	ErrPOSHeldNotFound    = errors.New("transaksi tertahan tidak ditemukan")
	ErrPOSPaymentShort    = errors.New("total pembayaran kurang dari total transaksi")
	ErrPOSOrderNotVoidable = errors.New("transaksi POS tidak bisa di-void")
)

// ─── Domain types ────────────────────────────────────────────────────────────

type POSSession struct {
	ID                uuid.UUID
	StoreID           uuid.UUID
	OpenedBy          uuid.UUID
	ClosedBy          *uuid.UUID
	OpeningCashCents  int64
	ClosingCashCents  *int64
	ExpectedCashCents *int64
	Notes             string
	Status            string // "open" | "closed"
	OpenedAt          time.Time
	ClosedAt          *time.Time

	// Populated by joined queries.
	OpenedByName string
	ClosedByName string
}

type POSSessionSummary struct {
	Session        *POSSession
	TotalSales     int64 // sum of orders.total_cents linked to this session (non-cancelled)
	TotalCash      int64
	TotalQRIS      int64
	TotalTransfer  int64
	TotalMidtrans  int64
	TotalEDCDebit  int64
	TotalEDCKredit int64
	TotalCashIn    int64
	TotalCashOut   int64
	OrderCount     int
	ExpectedCash   int64 // opening_cash + total_cash + cash_in - cash_out
}

type POSCashMovement struct {
	ID           uuid.UUID
	SessionID    uuid.UUID
	StoreID      uuid.UUID
	UserID       uuid.UUID
	Type         string // "in" | "out"
	AmountCents  int64
	Reason       string
	CreatedAt    time.Time
}

type POSHeldOrder struct {
	ID            uuid.UUID
	StoreID       uuid.UUID
	SessionID     uuid.UUID
	HeldBy        uuid.UUID
	Label         string
	CartSnapshot  json.RawMessage
	CreatedAt     time.Time
}

type POSPayment struct {
	Method      string // "cash" | "qris" | "manual_transfer" | "midtrans" | "edc_debit" | "edc_kredit"
	AmountCents int64
	// EDC fields — only populated when Method is edc_debit/edc_kredit.
	CardBrand       string // e.g. "BCA", "Mandiri", "Visa"
	CardLast4       string // 4 digit terakhir kartu
	ReferenceNumber string // dari struk EDC
	ApprovalCode    string // approval code bank
}

type POSOrderItem struct {
	ProductID   *uuid.UUID // nil for a synthetic take-away packaging line
	VariantID   *uuid.UUID
	Quantity    int
	UnitCents   int64 // override-able price (could differ from product.price_cents)
	ProductName string
	VariantName string
	ProductType string // "physical" | "digital"
	ServingType string // "" | "dine_in" | "takeaway" (recorded on food lines)
	// Modifiers are the chosen option snapshots (validated by the handler).
	// POS keeps UnitCents from the client (which already includes deltas).
	Modifiers []OptionSnapshot
	// PackagingMaterialID, when set, makes this line consume 1×Quantity of the
	// material (store-scoped) instead of resolving a product recipe. Used for
	// the take-away packaging charge line, which has no product/recipe.
	PackagingMaterialID *uuid.UUID
}

type CreatePOSOrderInput struct {
	StoreID       uuid.UUID
	SessionID     uuid.UUID
	CashierID     uuid.UUID
	CustomerName  string
	CustomerWA    string
	Items         []POSOrderItem
	Payments      []POSPayment
	DiscountType  string // "percent" | "fixed" | ""
	DiscountValue int64  // % (0-100) or cents
	RedeemPoints  int    // loyalty points to redeem (0 = none)
	Notes         string
}

type POSOrderResult struct {
	OrderID          uuid.UUID
	OrderNumber      string
	SubtotalCents    int64
	DiscountCents    int64
	TotalCents       int64
	PaymentMethod    string // primary or "pos_split"
	ChangeAmountCents int64
	CreatedAt        time.Time
	PointsEarned     int
	PointsRedeemed   int
}

// ─── Repo ────────────────────────────────────────────────────────────────────

type POSRepo struct {
	pool *pgxpool.Pool
}

func NewPOSRepo(pool *pgxpool.Pool) *POSRepo {
	return &POSRepo{pool: pool}
}

// ─── Sessions ────────────────────────────────────────────────────────────────

func (r *POSRepo) OpenSession(ctx context.Context, storeID, userID uuid.UUID, openingCents int64, notes string) (*POSSession, error) {
	// Guard: this user must not already have an open session in this store.
	existing, err := r.GetActiveSessionForUser(ctx, storeID, userID)
	if err != nil && !errors.Is(err, ErrPOSSessionNotFound) {
		return nil, err
	}
	if existing != nil {
		return nil, ErrPOSSessionExists
	}

	var s POSSession
	err = r.pool.QueryRow(ctx, `
		INSERT INTO pos_sessions (store_id, opened_by, opening_cash_cents, notes)
		VALUES ($1, $2, $3, $4)
		RETURNING id, store_id, opened_by, closed_by,
		          opening_cash_cents, closing_cash_cents, expected_cash_cents,
		          notes, status, opened_at, closed_at
	`, storeID, userID, openingCents, strings.TrimSpace(notes)).Scan(
		&s.ID, &s.StoreID, &s.OpenedBy, &s.ClosedBy,
		&s.OpeningCashCents, &s.ClosingCashCents, &s.ExpectedCashCents,
		&s.Notes, &s.Status, &s.OpenedAt, &s.ClosedAt,
	)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func (r *POSRepo) GetActiveSessionForUser(ctx context.Context, storeID, userID uuid.UUID) (*POSSession, error) {
	var s POSSession
	err := r.pool.QueryRow(ctx, `
		SELECT id, store_id, opened_by, closed_by,
		       opening_cash_cents, closing_cash_cents, expected_cash_cents,
		       notes, status, opened_at, closed_at
		FROM pos_sessions
		WHERE store_id = $1 AND opened_by = $2 AND status = 'open'
		ORDER BY opened_at DESC LIMIT 1
	`, storeID, userID).Scan(
		&s.ID, &s.StoreID, &s.OpenedBy, &s.ClosedBy,
		&s.OpeningCashCents, &s.ClosingCashCents, &s.ExpectedCashCents,
		&s.Notes, &s.Status, &s.OpenedAt, &s.ClosedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrPOSSessionNotFound
	}
	return &s, err
}

func (r *POSRepo) GetSessionByID(ctx context.Context, id, storeID uuid.UUID) (*POSSession, error) {
	var s POSSession
	err := r.pool.QueryRow(ctx, `
		SELECT ps.id, ps.store_id, ps.opened_by, ps.closed_by,
		       ps.opening_cash_cents, ps.closing_cash_cents, ps.expected_cash_cents,
		       ps.notes, ps.status, ps.opened_at, ps.closed_at,
		       COALESCE(u1.name, u1.email, ''),
		       COALESCE(u2.name, u2.email, '')
		FROM pos_sessions ps
		LEFT JOIN users u1 ON u1.id = ps.opened_by
		LEFT JOIN users u2 ON u2.id = ps.closed_by
		WHERE ps.id = $1 AND ps.store_id = $2
	`, id, storeID).Scan(
		&s.ID, &s.StoreID, &s.OpenedBy, &s.ClosedBy,
		&s.OpeningCashCents, &s.ClosingCashCents, &s.ExpectedCashCents,
		&s.Notes, &s.Status, &s.OpenedAt, &s.ClosedAt,
		&s.OpenedByName, &s.ClosedByName,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrPOSSessionNotFound
	}
	return &s, err
}

func (r *POSRepo) ListSessions(ctx context.Context, storeID uuid.UUID, limit, offset int) ([]POSSession, int, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT ps.id, ps.store_id, ps.opened_by, ps.closed_by,
		       ps.opening_cash_cents, ps.closing_cash_cents, ps.expected_cash_cents,
		       ps.notes, ps.status, ps.opened_at, ps.closed_at,
		       COALESCE(u1.name, u1.email, ''),
		       COALESCE(u2.name, u2.email, '')
		FROM pos_sessions ps
		LEFT JOIN users u1 ON u1.id = ps.opened_by
		LEFT JOIN users u2 ON u2.id = ps.closed_by
		WHERE ps.store_id = $1
		ORDER BY ps.opened_at DESC
		LIMIT $2 OFFSET $3
	`, storeID, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	var out []POSSession
	for rows.Next() {
		var s POSSession
		if err := rows.Scan(
			&s.ID, &s.StoreID, &s.OpenedBy, &s.ClosedBy,
			&s.OpeningCashCents, &s.ClosingCashCents, &s.ExpectedCashCents,
			&s.Notes, &s.Status, &s.OpenedAt, &s.ClosedAt,
			&s.OpenedByName, &s.ClosedByName,
		); err != nil {
			return nil, 0, err
		}
		out = append(out, s)
	}
	var total int
	_ = r.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM pos_sessions WHERE store_id = $1`, storeID,
	).Scan(&total)
	return out, total, rows.Err()
}

func (r *POSRepo) GetSummary(ctx context.Context, sessionID, storeID uuid.UUID) (*POSSessionSummary, error) {
	session, err := r.GetSessionByID(ctx, sessionID, storeID)
	if err != nil {
		return nil, err
	}

	summary := &POSSessionSummary{Session: session}

	// Order count + total sales (non-cancelled POS orders linked to this session).
	if err := r.pool.QueryRow(ctx, `
		SELECT COUNT(*), COALESCE(SUM(total_cents), 0)
		FROM orders
		WHERE pos_session_id = $1 AND status <> 'cancelled'
	`, sessionID).Scan(&summary.OrderCount, &summary.TotalSales); err != nil {
		return nil, fmt.Errorf("summary orders: %w", err)
	}

	// Breakdown per payment method.
	rows, err := r.pool.Query(ctx, `
		SELECT method, COALESCE(SUM(amount_cents), 0)
		FROM pos_order_payments pop
		JOIN orders o ON o.id = pop.order_id
		WHERE o.pos_session_id = $1 AND o.status <> 'cancelled'
		GROUP BY method
	`, sessionID)
	if err != nil {
		return nil, fmt.Errorf("summary payments: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var method string
		var amount int64
		if err := rows.Scan(&method, &amount); err != nil {
			return nil, err
		}
		switch method {
		case "cash":
			summary.TotalCash = amount
		case "qris":
			summary.TotalQRIS = amount
		case "manual_transfer":
			summary.TotalTransfer = amount
		case "midtrans":
			summary.TotalMidtrans = amount
		case "edc_debit":
			summary.TotalEDCDebit = amount
		case "edc_kredit":
			summary.TotalEDCKredit = amount
		}
	}

	// Cash in/out.
	if err := r.pool.QueryRow(ctx, `
		SELECT
		  COALESCE(SUM(amount_cents) FILTER (WHERE type = 'in'), 0),
		  COALESCE(SUM(amount_cents) FILTER (WHERE type = 'out'), 0)
		FROM pos_cash_movements
		WHERE pos_session_id = $1
	`, sessionID).Scan(&summary.TotalCashIn, &summary.TotalCashOut); err != nil {
		return nil, fmt.Errorf("summary movements: %w", err)
	}

	summary.ExpectedCash = session.OpeningCashCents +
		summary.TotalCash +
		summary.TotalCashIn -
		summary.TotalCashOut

	return summary, nil
}

func (r *POSRepo) CloseSession(ctx context.Context, sessionID, storeID, closedBy uuid.UUID, closingCents int64) error {
	summary, err := r.GetSummary(ctx, sessionID, storeID)
	if err != nil {
		return err
	}
	if summary.Session.Status != "open" {
		return ErrPOSSessionNotOpen
	}

	tag, err := r.pool.Exec(ctx, `
		UPDATE pos_sessions
		SET closing_cash_cents = $3,
		    expected_cash_cents = $4,
		    closed_by = $5,
		    closed_at = now(),
		    status = 'closed'
		WHERE id = $1 AND store_id = $2 AND status = 'open'
	`, sessionID, storeID, closingCents, summary.ExpectedCash, closedBy)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrPOSSessionNotFound
	}
	return nil
}

// ─── Cash movements ──────────────────────────────────────────────────────────

func (r *POSRepo) AddCashMovement(ctx context.Context, sessionID, storeID, userID uuid.UUID, kind string, amountCents int64, reason string) (*POSCashMovement, error) {
	if kind != "in" && kind != "out" {
		return nil, fmt.Errorf("invalid movement type %q", kind)
	}
	if amountCents <= 0 {
		return nil, errors.New("jumlah harus lebih besar dari nol")
	}

	var m POSCashMovement
	err := r.pool.QueryRow(ctx, `
		INSERT INTO pos_cash_movements (pos_session_id, store_id, user_id, type, amount_cents, reason)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, pos_session_id, store_id, user_id, type, amount_cents, reason, created_at
	`, sessionID, storeID, userID, kind, amountCents, strings.TrimSpace(reason)).Scan(
		&m.ID, &m.SessionID, &m.StoreID, &m.UserID, &m.Type, &m.AmountCents, &m.Reason, &m.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &m, nil
}

func (r *POSRepo) ListCashMovements(ctx context.Context, sessionID uuid.UUID) ([]POSCashMovement, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, pos_session_id, store_id, user_id, type, amount_cents, reason, created_at
		FROM pos_cash_movements
		WHERE pos_session_id = $1
		ORDER BY created_at DESC
	`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []POSCashMovement
	for rows.Next() {
		var m POSCashMovement
		if err := rows.Scan(&m.ID, &m.SessionID, &m.StoreID, &m.UserID,
			&m.Type, &m.AmountCents, &m.Reason, &m.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// ─── Held orders ─────────────────────────────────────────────────────────────

func (r *POSRepo) CreateHeldOrder(ctx context.Context, storeID, sessionID, userID uuid.UUID, label string, snapshot json.RawMessage) (*POSHeldOrder, error) {
	var h POSHeldOrder
	err := r.pool.QueryRow(ctx, `
		INSERT INTO pos_held_orders (store_id, pos_session_id, held_by, label, cart_snapshot)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, store_id, pos_session_id, held_by, label, cart_snapshot, created_at
	`, storeID, sessionID, userID, strings.TrimSpace(label), snapshot).Scan(
		&h.ID, &h.StoreID, &h.SessionID, &h.HeldBy, &h.Label, &h.CartSnapshot, &h.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &h, nil
}

func (r *POSRepo) ListHeldOrders(ctx context.Context, sessionID uuid.UUID) ([]POSHeldOrder, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, store_id, pos_session_id, held_by, label, cart_snapshot, created_at
		FROM pos_held_orders
		WHERE pos_session_id = $1
		ORDER BY created_at DESC
	`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []POSHeldOrder
	for rows.Next() {
		var h POSHeldOrder
		if err := rows.Scan(&h.ID, &h.StoreID, &h.SessionID, &h.HeldBy,
			&h.Label, &h.CartSnapshot, &h.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, h)
	}
	return out, rows.Err()
}

func (r *POSRepo) DeleteHeldOrder(ctx context.Context, id, storeID uuid.UUID) error {
	tag, err := r.pool.Exec(ctx,
		`DELETE FROM pos_held_orders WHERE id = $1 AND store_id = $2`,
		id, storeID,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrPOSHeldNotFound
	}
	return nil
}

// ─── POS Order creation ──────────────────────────────────────────────────────

// CreatePOSOrder builds a completed POS order in one transaction:
// validates the session, computes totals, decrements stock, inserts order
// + items + payments, and upserts the customer if name+WA are provided.
//
// Stock decrement mirrors OrderRepo.Create — optimistic conditional UPDATE
// with rows-affected check. No FOR UPDATE; relies on `stock >= $qty` guard.
func (r *POSRepo) CreatePOSOrder(ctx context.Context, in CreatePOSOrderInput) (*POSOrderResult, error) {
	if len(in.Items) == 0 {
		return nil, errors.New("minimal 1 item")
	}
	// NOTE: empty payments is allowed only for free orders (total 0). The
	// "paidTotal < total" check below rejects empty payments when total > 0,
	// so no separate min-payment guard is needed here.

	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	// Validate session: must exist, belong to this store, be open, and be
	// owned by the cashier creating the order.
	var sessStatus string
	var sessOwner uuid.UUID
	if err := tx.QueryRow(ctx, `
		SELECT status, opened_by FROM pos_sessions
		WHERE id = $1 AND store_id = $2
	`, in.SessionID, in.StoreID).Scan(&sessStatus, &sessOwner); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrPOSSessionNotFound
		}
		return nil, err
	}
	if sessStatus != "open" {
		return nil, ErrPOSSessionNotOpen
	}
	if sessOwner != in.CashierID {
		return nil, errors.New("sesi kasir bukan milik kamu")
	}

	// Subtotal.
	var subtotal int64
	for _, it := range in.Items {
		subtotal += it.UnitCents * int64(it.Quantity)
	}

	// Manual discount.
	var discount int64
	switch in.DiscountType {
	case "percent":
		if in.DiscountValue < 0 {
			in.DiscountValue = 0
		}
		if in.DiscountValue > 100 {
			in.DiscountValue = 100
		}
		discount = subtotal * in.DiscountValue / 100
	case "fixed":
		discount = in.DiscountValue
	}
	if discount > subtotal {
		discount = subtotal
	}
	if discount < 0 {
		discount = 0
	}

	// Loyalty config + redeem calculation.
	wa := strings.TrimSpace(in.CustomerWA)
	name := strings.TrimSpace(in.CustomerName)
	var loyaltyCfg LoyaltyConfig
	var existingCust *LoyaltyCustomer
	if err := tx.QueryRow(ctx,
		`SELECT loyalty_enabled, loyalty_earn_rate_cents, loyalty_redeem_rate_cents
		 FROM stores WHERE id = $1`, in.StoreID,
	).Scan(&loyaltyCfg.Enabled, &loyaltyCfg.EarnRateCents, &loyaltyCfg.RedeemRateCents); err != nil {
		return nil, fmt.Errorf("read loyalty config: %w", err)
	}

	if loyaltyCfg.Enabled && wa != "" {
		// Pre-fetch customer (if exists) for redeem validation.
		var cust LoyaltyCustomer
		err := tx.QueryRow(ctx, `
			SELECT id, name, whatsapp_number, loyalty_points, total_orders, total_spent_cents
			FROM customers WHERE store_id = $1 AND whatsapp_number = $2
		`, in.StoreID, wa).Scan(&cust.ID, &cust.Name, &cust.WhatsApp,
			&cust.LoyaltyPoints, &cust.TotalOrders, &cust.TotalSpentCents)
		if err == nil {
			existingCust = &cust
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return nil, err
		}
	}

	// Redeem discount: convert points to cents.
	var redeemDiscount int64
	redeemPoints := in.RedeemPoints
	if redeemPoints > 0 {
		if !loyaltyCfg.Enabled {
			return nil, errors.New("loyalty belum aktif di toko ini")
		}
		if existingCust == nil {
			return nil, errors.New("pembeli belum terdaftar — tidak bisa redeem poin")
		}
		if existingCust.LoyaltyPoints < redeemPoints {
			return nil, ErrInsufficientPoints
		}
		redeemDiscount = int64(redeemPoints) * loyaltyCfg.RedeemRateCents
		// Cap redeem discount so total stays >= 0.
		remaining := subtotal - discount
		if redeemDiscount > remaining {
			redeemDiscount = remaining
			// Recompute actual redeemed points so we don't burn more than needed.
			if loyaltyCfg.RedeemRateCents > 0 {
				redeemPoints = int(redeemDiscount / loyaltyCfg.RedeemRateCents)
				if int64(redeemPoints)*loyaltyCfg.RedeemRateCents < redeemDiscount {
					redeemPoints++
				}
				if redeemPoints > existingCust.LoyaltyPoints {
					redeemPoints = existingCust.LoyaltyPoints
				}
				redeemDiscount = int64(redeemPoints) * loyaltyCfg.RedeemRateCents
			}
		}
	}

	totalDiscount := discount + redeemDiscount
	if totalDiscount > subtotal {
		totalDiscount = subtotal
	}
	total := subtotal - totalDiscount

	// Validate payments cover total.
	var paidTotal int64
	for _, p := range in.Payments {
		if p.AmountCents <= 0 {
			return nil, errors.New("nominal pembayaran harus > 0")
		}
		paidTotal += p.AmountCents
	}
	if paidTotal < total {
		return nil, ErrPOSPaymentShort
	}
	change := paidTotal - total

	// Determine primary payment method label for orders.payment_method.
	// A free order (total fully covered by points/discount) carries no
	// payment rows — label it "free" and skip the payments insert below.
	primaryMethod := "free"
	if len(in.Payments) == 1 {
		primaryMethod = in.Payments[0].Method
	} else if len(in.Payments) > 1 {
		primaryMethod = "pos_split"
	}

	// Upsert customer (if name + WA provided).
	var customerID *uuid.UUID
	if name != "" && wa != "" {
		var cid uuid.UUID
		if err := tx.QueryRow(ctx, `
			INSERT INTO customers (store_id, name, whatsapp_number,
			                       total_orders, total_spent_cents, last_order_at)
			VALUES ($1, $2, $3, 1, $4, now())
			ON CONFLICT (store_id, whatsapp_number) DO UPDATE SET
			    name = EXCLUDED.name,
			    total_orders = customers.total_orders + 1,
			    total_spent_cents = customers.total_spent_cents + EXCLUDED.total_spent_cents,
			    last_order_at = now(),
			    updated_at = now()
			RETURNING id
		`, in.StoreID, name, wa, total).Scan(&cid); err != nil {
			return nil, fmt.Errorf("upsert customer: %w", err)
		}
		customerID = &cid
	}

	// Generate order number — same format as storefront orders.
	orderNum := generateOrderNumber()

	// Insert order. POS orders are completed + paid immediately.
	var result POSOrderResult
	now := time.Now().UTC()
	if err := tx.QueryRow(ctx, `
		INSERT INTO orders (
		    store_id, customer_id, order_number,
		    status, payment_status, payment_method,
		    subtotal_cents, shipping_cents, discount_cents, total_cents,
		    customer_name, customer_whatsapp,
		    notes,
		    source, pos_session_id, change_amount_cents,
		    loyalty_points_redeemed, loyalty_discount_cents,
		    paid_at, completed_at
		)
		VALUES (
		    $1, $2, $3,
		    'completed', 'paid', $4,
		    $5, 0, $6, $7,
		    $8, $9,
		    $10,
		    'pos', $11, $12,
		    $13, $14,
		    $15, $15
		)
		RETURNING id, order_number, subtotal_cents, discount_cents, total_cents,
		          payment_method, change_amount_cents, created_at
	`,
		in.StoreID, customerID, orderNum,
		primaryMethod,
		subtotal, totalDiscount, total,
		name, wa,
		strings.TrimSpace(in.Notes),
		in.SessionID, change,
		redeemPoints, redeemDiscount,
		now,
	).Scan(
		&result.OrderID, &result.OrderNumber,
		&result.SubtotalCents, &result.DiscountCents, &result.TotalCents,
		&result.PaymentMethod, &result.ChangeAmountCents, &result.CreatedAt,
	); err != nil {
		return nil, fmt.Errorf("insert order: %w", err)
	}

	// Decrement stock + insert order_items.
	for _, it := range in.Items {
		isDigital := it.ProductType == "digital"

		// Skip stock decrement for the synthetic take-away packaging line
		// (no product — it consumes a material instead, handled below).
		if !isDigital && it.ProductID != nil {
			var rowsAffected int64
			if it.VariantID != nil {
				tag, err := tx.Exec(ctx, `
					UPDATE product_variants
					SET stock = stock - $2
					WHERE id = $1 AND stock >= $2
				`, *it.VariantID, it.Quantity)
				if err != nil {
					return nil, fmt.Errorf("decrement variant stock: %w", err)
				}
				rowsAffected = tag.RowsAffected()
			} else {
				tag, err := tx.Exec(ctx, `
					UPDATE products
					SET stock = stock - $2, updated_at = now()
					WHERE id = $1 AND stock >= $2
				`, *it.ProductID, it.Quantity)
				if err != nil {
					return nil, fmt.Errorf("decrement product stock: %w", err)
				}
				rowsAffected = tag.RowsAffected()
			}
			if rowsAffected == 0 {
				return nil, ErrStockInsufficient
			}
		}

		productType := it.ProductType
		if productType != "digital" {
			productType = "physical"
		}
		var orderItemID uuid.UUID
		if err := tx.QueryRow(ctx, `
			INSERT INTO order_items (order_id, product_id, variant_id, product_name, variant_name,
			                         unit_price_cents, quantity, subtotal_cents, product_type, serving_type)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
			RETURNING id
		`,
			result.OrderID, it.ProductID, it.VariantID, it.ProductName, it.VariantName,
			it.UnitCents, it.Quantity, it.UnitCents*int64(it.Quantity), productType, it.ServingType,
		).Scan(&orderItemID); err != nil {
			return nil, fmt.Errorf("insert order_item: %w", err)
		}

		if err := insertOrderItemModifiersTx(ctx, tx, orderItemID, it.Modifiers); err != nil {
			return nil, fmt.Errorf("insert order_item_modifiers: %w", err)
		}

		// Record raw-material consumption (soft). Food lines resolve the
		// product base + option recipes × qty; the take-away packaging line
		// consumes its linked material directly (1 × qty).
		var consume []consumeRow
		if it.ProductID != nil {
			c, err := resolveConsumptionTx(ctx, tx, *it.ProductID, optionIDsFromSnaps(it.Modifiers), it.Quantity)
			if err != nil {
				return nil, fmt.Errorf("resolve consumption: %w", err)
			}
			consume = c
		}
		if it.PackagingMaterialID != nil {
			pkg, err := resolveMaterialConsumeTx(ctx, tx, in.StoreID, *it.PackagingMaterialID, it.Quantity)
			if err != nil {
				return nil, fmt.Errorf("resolve packaging consumption: %w", err)
			}
			if pkg != nil {
				consume = append(consume, *pkg)
			}
		}
		if err := applyConsumptionTx(ctx, tx, in.StoreID, result.OrderID, orderItemID, consume); err != nil {
			return nil, fmt.Errorf("apply consumption: %w", err)
		}
	}

	// Insert payments breakdown.
	for _, p := range in.Payments {
		if _, err := tx.Exec(ctx, `
			INSERT INTO pos_order_payments
			    (order_id, method, amount_cents,
			     card_brand, card_last4, reference_number, approval_code)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
		`, result.OrderID, p.Method, p.AmountCents,
			strings.TrimSpace(p.CardBrand), strings.TrimSpace(p.CardLast4),
			strings.TrimSpace(p.ReferenceNumber), strings.TrimSpace(p.ApprovalCode),
		); err != nil {
			return nil, fmt.Errorf("insert payment: %w", err)
		}
	}

	// Loyalty: redeem first (so balance reflects pre-earn), then earn from
	// the actual amount paid (= total).
	if loyaltyCfg.Enabled && customerID != nil {
		if redeemPoints > 0 {
			if err := applyLoyaltyTx(ctx, tx, in.StoreID, *customerID, &result.OrderID,
				-redeemPoints, "redeem",
				fmt.Sprintf("Redeem %d poin di POS #%s", redeemPoints, result.OrderNumber),
			); err != nil {
				return nil, fmt.Errorf("redeem points: %w", err)
			}
			result.PointsRedeemed = redeemPoints
		}
		if loyaltyCfg.EarnRateCents > 0 {
			earn := int(total / loyaltyCfg.EarnRateCents)
			if earn > 0 {
				// Membership perk: boost earned points by the customer's tier
				// multiplier (1.0 when no tier). Non-fatal — fall back to base.
				if mult, merr := resolveTierMultiplierTx(ctx, tx, in.StoreID, *customerID); merr == nil && mult > 1.0 {
					earn = int(float64(earn) * mult)
				}
				if err := applyLoyaltyTx(ctx, tx, in.StoreID, *customerID, &result.OrderID,
					earn, "earn",
					fmt.Sprintf("Earn dari POS #%s", result.OrderNumber),
				); err != nil {
					return nil, fmt.Errorf("earn points: %w", err)
				}
				result.PointsEarned = earn
			}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &result, nil
}

// VoidPOSOrder cancels a POS order and restores stock. Only allowed if the
// order is still within an open session that belongs to this store.
func (r *POSRepo) VoidPOSOrder(ctx context.Context, orderID, storeID uuid.UUID, reason string) error {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Validate: order is POS, completed, and belongs to an open session.
	var source, status string
	var sessionID *uuid.UUID
	if err := tx.QueryRow(ctx, `
		SELECT source, status, pos_session_id FROM orders
		WHERE id = $1 AND store_id = $2
	`, orderID, storeID).Scan(&source, &status, &sessionID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrOrderNotFound
		}
		return err
	}
	if source != "pos" || status != "completed" || sessionID == nil {
		return ErrPOSOrderNotVoidable
	}

	var sessStatus string
	if err := tx.QueryRow(ctx,
		`SELECT status FROM pos_sessions WHERE id = $1`, *sessionID,
	).Scan(&sessStatus); err != nil {
		return err
	}
	if sessStatus != "open" {
		return ErrPOSOrderNotVoidable
	}

	// Restore stock per item (physical only).
	rows, err := tx.Query(ctx, `
		SELECT product_id, variant_id, quantity, product_type
		FROM order_items WHERE order_id = $1
	`, orderID)
	if err != nil {
		return err
	}
	type itemRestore struct {
		ProductID   *uuid.UUID
		VariantID   *uuid.UUID
		Quantity    int
		ProductType string
	}
	var items []itemRestore
	for rows.Next() {
		var it itemRestore
		if err := rows.Scan(&it.ProductID, &it.VariantID, &it.Quantity, &it.ProductType); err != nil {
			rows.Close()
			return err
		}
		items = append(items, it)
	}
	rows.Close()
	for _, it := range items {
		if it.ProductType == "digital" || it.ProductID == nil {
			continue
		}
		if it.VariantID != nil {
			if _, err := tx.Exec(ctx,
				`UPDATE product_variants SET stock = stock + $2 WHERE id = $1`,
				*it.VariantID, it.Quantity,
			); err != nil {
				return fmt.Errorf("restore variant stock: %w", err)
			}
		} else {
			if _, err := tx.Exec(ctx,
				`UPDATE products SET stock = stock + $2, updated_at = now() WHERE id = $1`,
				*it.ProductID, it.Quantity,
			); err != nil {
				return fmt.Errorf("restore product stock: %w", err)
			}
		}
	}

	// Mark cancelled.
	if _, err := tx.Exec(ctx, `
		UPDATE orders
		SET status = 'cancelled',
		    cancelled_at = now(),
		    cancellation_reason = $3,
		    updated_at = now()
		WHERE id = $1 AND store_id = $2
	`, orderID, storeID, reason); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// ─── Reports / lookups ──────────────────────────────────────────────────────

// POSSessionOrder is a single transaction row for the session detail page.
type POSSessionOrder struct {
	OrderID         uuid.UUID
	OrderNumber     string
	Status          string
	PaymentMethod   string
	SubtotalCents   int64
	DiscountCents   int64
	TotalCents      int64
	ChangeCents     int64
	CustomerName    string
	CustomerWA      string
	Notes           string
	CreatedAt       time.Time
	ItemCount       int
	Payments        []POSPayment
	RefundedAt      *time.Time
	RefundReason    string
}

func (r *POSRepo) ListOrdersBySession(ctx context.Context, sessionID, storeID uuid.UUID) ([]POSSessionOrder, error) {
	// Verify session belongs to store first.
	var ok bool
	if err := r.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM pos_sessions WHERE id = $1 AND store_id = $2)`,
		sessionID, storeID,
	).Scan(&ok); err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrPOSSessionNotFound
	}

	rows, err := r.pool.Query(ctx, `
		SELECT o.id, o.order_number, o.status, o.payment_method,
		       o.subtotal_cents, o.discount_cents, o.total_cents, o.change_amount_cents,
		       o.customer_name, o.customer_whatsapp, o.notes, o.created_at,
		       o.refunded_at, COALESCE(o.refund_reason, ''),
		       (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) AS item_count
		FROM orders o
		WHERE o.pos_session_id = $1
		ORDER BY o.created_at DESC
	`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []POSSessionOrder
	for rows.Next() {
		var x POSSessionOrder
		if err := rows.Scan(
			&x.OrderID, &x.OrderNumber, &x.Status, &x.PaymentMethod,
			&x.SubtotalCents, &x.DiscountCents, &x.TotalCents, &x.ChangeCents,
			&x.CustomerName, &x.CustomerWA, &x.Notes, &x.CreatedAt,
			&x.RefundedAt, &x.RefundReason, &x.ItemCount,
		); err != nil {
			return nil, err
		}
		out = append(out, x)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Hydrate payments per order (single follow-up query — N is bounded).
	for i := range out {
		out[i].Payments, _ = r.GetOrderPayments(ctx, out[i].OrderID)
	}
	return out, nil
}

// ReturnOrder fully cancels a previously-completed POS order. Restores stock,
// marks order as cancelled, and records refund metadata. Used for past-shift
// returns (vs VoidPOSOrder which is in-shift only).
func (r *POSRepo) ReturnOrder(ctx context.Context, orderID, storeID uuid.UUID, reason string) error {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var source, status string
	var totalCents int64
	if err := tx.QueryRow(ctx, `
		SELECT source, status, total_cents FROM orders
		WHERE id = $1 AND store_id = $2
	`, orderID, storeID).Scan(&source, &status, &totalCents); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrOrderNotFound
		}
		return err
	}
	if source != "pos" || status != "completed" {
		return ErrPOSOrderNotVoidable
	}

	// Restore stock per item.
	rows, err := tx.Query(ctx, `
		SELECT product_id, variant_id, quantity, product_type
		FROM order_items WHERE order_id = $1
	`, orderID)
	if err != nil {
		return err
	}
	type itemRestore struct {
		ProductID   *uuid.UUID
		VariantID   *uuid.UUID
		Quantity    int
		ProductType string
	}
	var items []itemRestore
	for rows.Next() {
		var it itemRestore
		if err := rows.Scan(&it.ProductID, &it.VariantID, &it.Quantity, &it.ProductType); err != nil {
			rows.Close()
			return err
		}
		items = append(items, it)
	}
	rows.Close()
	for _, it := range items {
		if it.ProductType == "digital" || it.ProductID == nil {
			continue
		}
		if it.VariantID != nil {
			if _, err := tx.Exec(ctx,
				`UPDATE product_variants SET stock = stock + $2 WHERE id = $1`,
				*it.VariantID, it.Quantity,
			); err != nil {
				return err
			}
		} else {
			if _, err := tx.Exec(ctx,
				`UPDATE products SET stock = stock + $2, updated_at = now() WHERE id = $1`,
				*it.ProductID, it.Quantity,
			); err != nil {
				return err
			}
		}
	}

	if _, err := tx.Exec(ctx, `
		UPDATE orders
		SET status = 'cancelled',
		    cancelled_at = now(),
		    refunded_at = now(),
		    refund_amount_cents = $3,
		    refund_reason = $4,
		    cancellation_reason = 'Retur POS',
		    updated_at = now()
		WHERE id = $1 AND store_id = $2
	`, orderID, storeID, totalCents, reason); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// POSReportFilter narrows the report by date and cashier.
type POSReportFilter struct {
	StoreID   uuid.UUID
	CashierID *uuid.UUID // nil = all cashiers
	From      *time.Time // nil = no lower bound
	To        *time.Time // nil = no upper bound
}

type POSReportMetrics struct {
	OrderCount      int     // non-cancelled
	TotalGross      int64   // sum total_cents of non-cancelled
	TotalRefunded   int64   // sum refund_amount_cents
	AvgTransaction  int64   // gross / count (0 if count=0)
	TotalCash       int64
	TotalQRIS       int64
	TotalTransfer   int64
	TotalMidtrans   int64
	TotalEDCDebit   int64
	TotalEDCKredit  int64
	DailySeries     []POSReportDailyPoint
	TopProducts     []POSReportProduct
	ByCashier       []POSReportCashier
}

type POSReportCashier struct {
	CashierID   uuid.UUID
	CashierName string
	OrderCount  int
	TotalCents  int64
}

type POSReportDailyPoint struct {
	Date         string // YYYY-MM-DD
	OrderCount   int
	TotalCents   int64
}

type POSReportProduct struct {
	ProductID   uuid.UUID
	ProductName string
	Quantity    int
	TotalCents  int64
}

func (r *POSRepo) GetPOSReport(ctx context.Context, f POSReportFilter) (*POSReportMetrics, error) {
	// Build WHERE clauses dynamically.
	clauses := []string{"o.store_id = $1", "o.source = 'pos'", "o.status <> 'cancelled'"}
	args := []any{f.StoreID}
	pos := 2
	if f.From != nil {
		clauses = append(clauses, fmt.Sprintf("o.created_at >= $%d", pos))
		args = append(args, *f.From)
		pos++
	}
	if f.To != nil {
		clauses = append(clauses, fmt.Sprintf("o.created_at < $%d", pos))
		args = append(args, *f.To)
		pos++
	}
	if f.CashierID != nil {
		clauses = append(clauses, fmt.Sprintf("ps.opened_by = $%d", pos))
		args = append(args, *f.CashierID)
		pos++
	}
	where := strings.Join(clauses, " AND ")

	m := &POSReportMetrics{}

	// Aggregate count + gross.
	{
		q := fmt.Sprintf(`
			SELECT COUNT(*), COALESCE(SUM(o.total_cents), 0)
			FROM orders o
			LEFT JOIN pos_sessions ps ON ps.id = o.pos_session_id
			WHERE %s
		`, where)
		if err := r.pool.QueryRow(ctx, q, args...).Scan(&m.OrderCount, &m.TotalGross); err != nil {
			return nil, fmt.Errorf("report aggregate: %w", err)
		}
	}

	// Refunded amount (cancelled orders with refund_amount_cents).
	{
		refClauses := []string{"o.store_id = $1", "o.source = 'pos'", "o.refund_amount_cents > 0"}
		refArgs := []any{f.StoreID}
		rpos := 2
		if f.From != nil {
			refClauses = append(refClauses, fmt.Sprintf("o.refunded_at >= $%d", rpos))
			refArgs = append(refArgs, *f.From)
			rpos++
		}
		if f.To != nil {
			refClauses = append(refClauses, fmt.Sprintf("o.refunded_at < $%d", rpos))
			refArgs = append(refArgs, *f.To)
			rpos++
		}
		if f.CashierID != nil {
			refClauses = append(refClauses, fmt.Sprintf("ps.opened_by = $%d", rpos))
			refArgs = append(refArgs, *f.CashierID)
			rpos++
		}
		refWhere := strings.Join(refClauses, " AND ")
		q := fmt.Sprintf(`
			SELECT COALESCE(SUM(o.refund_amount_cents), 0)
			FROM orders o
			LEFT JOIN pos_sessions ps ON ps.id = o.pos_session_id
			WHERE %s
		`, refWhere)
		_ = r.pool.QueryRow(ctx, q, refArgs...).Scan(&m.TotalRefunded)
	}

	if m.OrderCount > 0 {
		m.AvgTransaction = m.TotalGross / int64(m.OrderCount)
	}

	// Payment method breakdown.
	{
		q := fmt.Sprintf(`
			SELECT pop.method, COALESCE(SUM(pop.amount_cents), 0)
			FROM pos_order_payments pop
			JOIN orders o ON o.id = pop.order_id
			LEFT JOIN pos_sessions ps ON ps.id = o.pos_session_id
			WHERE %s
			GROUP BY pop.method
		`, where)
		rows, err := r.pool.Query(ctx, q, args...)
		if err != nil {
			return nil, fmt.Errorf("payment breakdown: %w", err)
		}
		for rows.Next() {
			var method string
			var amount int64
			if err := rows.Scan(&method, &amount); err != nil {
				rows.Close()
				return nil, err
			}
			switch method {
			case "cash":
				m.TotalCash = amount
			case "qris":
				m.TotalQRIS = amount
			case "manual_transfer":
				m.TotalTransfer = amount
			case "midtrans":
				m.TotalMidtrans = amount
			case "edc_debit":
				m.TotalEDCDebit = amount
			case "edc_kredit":
				m.TotalEDCKredit = amount
			}
		}
		rows.Close()
	}

	// Daily series (last 30 days within filter window).
	{
		q := fmt.Sprintf(`
			SELECT TO_CHAR(date_trunc('day', o.created_at AT TIME ZONE 'Asia/Jakarta'), 'YYYY-MM-DD') AS day,
			       COUNT(*), COALESCE(SUM(o.total_cents), 0)
			FROM orders o
			LEFT JOIN pos_sessions ps ON ps.id = o.pos_session_id
			WHERE %s
			GROUP BY day
			ORDER BY day DESC
			LIMIT 60
		`, where)
		rows, err := r.pool.Query(ctx, q, args...)
		if err != nil {
			return nil, fmt.Errorf("daily series: %w", err)
		}
		for rows.Next() {
			var p POSReportDailyPoint
			if err := rows.Scan(&p.Date, &p.OrderCount, &p.TotalCents); err != nil {
				rows.Close()
				return nil, err
			}
			m.DailySeries = append(m.DailySeries, p)
		}
		rows.Close()
	}

	// By cashier rollup.
	{
		q := fmt.Sprintf(`
			SELECT ps.opened_by,
			       COALESCE(u.name, u.email, ''),
			       COUNT(o.id),
			       COALESCE(SUM(o.total_cents), 0)
			FROM orders o
			JOIN pos_sessions ps ON ps.id = o.pos_session_id
			LEFT JOIN users u ON u.id = ps.opened_by
			WHERE %s
			GROUP BY ps.opened_by, u.name, u.email
			ORDER BY SUM(o.total_cents) DESC
		`, where)
		rows, err := r.pool.Query(ctx, q, args...)
		if err != nil {
			return nil, fmt.Errorf("by cashier: %w", err)
		}
		for rows.Next() {
			var c POSReportCashier
			if err := rows.Scan(&c.CashierID, &c.CashierName, &c.OrderCount, &c.TotalCents); err != nil {
				rows.Close()
				return nil, err
			}
			m.ByCashier = append(m.ByCashier, c)
		}
		rows.Close()
	}

	// Top products by quantity.
	{
		q := fmt.Sprintf(`
			SELECT oi.product_id, oi.product_name,
			       SUM(oi.quantity), COALESCE(SUM(oi.subtotal_cents), 0)
			FROM order_items oi
			JOIN orders o ON o.id = oi.order_id
			LEFT JOIN pos_sessions ps ON ps.id = o.pos_session_id
			WHERE %s AND oi.product_id IS NOT NULL
			GROUP BY oi.product_id, oi.product_name
			ORDER BY SUM(oi.quantity) DESC
			LIMIT 10
		`, where)
		rows, err := r.pool.Query(ctx, q, args...)
		if err != nil {
			return nil, fmt.Errorf("top products: %w", err)
		}
		for rows.Next() {
			var p POSReportProduct
			if err := rows.Scan(&p.ProductID, &p.ProductName, &p.Quantity, &p.TotalCents); err != nil {
				rows.Close()
				return nil, err
			}
			m.TopProducts = append(m.TopProducts, p)
		}
		rows.Close()
	}

	return m, nil
}

// POSCashier is a single cashier (user) who has activity in this store.
type POSCashier struct {
	UserID uuid.UUID
	Name   string
	Email  string
}

func (r *POSRepo) ListCashiers(ctx context.Context, storeID uuid.UUID) ([]POSCashier, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT DISTINCT u.id, COALESCE(u.name, ''), COALESCE(u.email, '')
		FROM pos_sessions ps
		JOIN users u ON u.id = ps.opened_by
		WHERE ps.store_id = $1
		ORDER BY COALESCE(u.name, u.email)
	`, storeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []POSCashier
	for rows.Next() {
		var c POSCashier
		if err := rows.Scan(&c.UserID, &c.Name, &c.Email); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// ListSessionsFiltered lists shifts with date + cashier filters for the
// riwayat shift page.
type ListSessionsFilter struct {
	StoreID   uuid.UUID
	CashierID *uuid.UUID
	From      *time.Time
	To        *time.Time
	Status    string // "open" | "closed" | "" (all)
	Limit     int
	Offset    int
}

func (r *POSRepo) ListSessionsFiltered(ctx context.Context, f ListSessionsFilter) ([]POSSession, int, error) {
	clauses := []string{"ps.store_id = $1"}
	args := []any{f.StoreID}
	pos := 2
	if f.CashierID != nil {
		clauses = append(clauses, fmt.Sprintf("ps.opened_by = $%d", pos))
		args = append(args, *f.CashierID)
		pos++
	}
	if f.From != nil {
		clauses = append(clauses, fmt.Sprintf("ps.opened_at >= $%d", pos))
		args = append(args, *f.From)
		pos++
	}
	if f.To != nil {
		clauses = append(clauses, fmt.Sprintf("ps.opened_at < $%d", pos))
		args = append(args, *f.To)
		pos++
	}
	if f.Status != "" {
		clauses = append(clauses, fmt.Sprintf("ps.status = $%d", pos))
		args = append(args, f.Status)
		pos++
	}
	where := strings.Join(clauses, " AND ")

	q := fmt.Sprintf(`
		SELECT ps.id, ps.store_id, ps.opened_by, ps.closed_by,
		       ps.opening_cash_cents, ps.closing_cash_cents, ps.expected_cash_cents,
		       ps.notes, ps.status, ps.opened_at, ps.closed_at,
		       COALESCE(u1.name, u1.email, ''),
		       COALESCE(u2.name, u2.email, '')
		FROM pos_sessions ps
		LEFT JOIN users u1 ON u1.id = ps.opened_by
		LEFT JOIN users u2 ON u2.id = ps.closed_by
		WHERE %s
		ORDER BY ps.opened_at DESC
		LIMIT $%d OFFSET $%d
	`, where, pos, pos+1)
	args = append(args, f.Limit, f.Offset)

	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	var out []POSSession
	for rows.Next() {
		var s POSSession
		if err := rows.Scan(
			&s.ID, &s.StoreID, &s.OpenedBy, &s.ClosedBy,
			&s.OpeningCashCents, &s.ClosingCashCents, &s.ExpectedCashCents,
			&s.Notes, &s.Status, &s.OpenedAt, &s.ClosedAt,
			&s.OpenedByName, &s.ClosedByName,
		); err != nil {
			return nil, 0, err
		}
		out = append(out, s)
	}

	var total int
	countQ := fmt.Sprintf(`SELECT COUNT(*) FROM pos_sessions ps WHERE %s`, where)
	countArgs := args[:len(args)-2] // drop limit + offset
	_ = r.pool.QueryRow(ctx, countQ, countArgs...).Scan(&total)
	return out, total, rows.Err()
}

// ─── Loyalty ─────────────────────────────────────────────────────────────────

type LoyaltyConfig struct {
	Enabled           bool
	EarnRateCents     int64 // 1 point earned per X cents spent
	RedeemRateCents   int64 // 1 point = Y cents discount
}

type LoyaltyCustomer struct {
	ID            uuid.UUID
	Name          string
	WhatsApp      string
	LoyaltyPoints int
	TotalOrders   int
	TotalSpentCents int64
}

type LoyaltyTransaction struct {
	ID           uuid.UUID
	StoreID      uuid.UUID
	CustomerID   uuid.UUID
	OrderID      *uuid.UUID
	Type         string // earn | redeem | adjust | expire
	Points       int    // signed
	BalanceAfter int
	Reason       string
	CreatedAt    time.Time
}

var ErrInsufficientPoints = errors.New("poin tidak cukup")

// GetLoyaltyConfig reads the per-store loyalty configuration.
func (r *POSRepo) GetLoyaltyConfig(ctx context.Context, storeID uuid.UUID) (*LoyaltyConfig, error) {
	var c LoyaltyConfig
	err := r.pool.QueryRow(ctx,
		`SELECT loyalty_enabled, loyalty_earn_rate_cents, loyalty_redeem_rate_cents
		 FROM stores WHERE id = $1`,
		storeID,
	).Scan(&c.Enabled, &c.EarnRateCents, &c.RedeemRateCents)
	if err != nil {
		return nil, err
	}
	return &c, nil
}

// UpdateLoyaltyConfig sets the store's loyalty config.
func (r *POSRepo) UpdateLoyaltyConfig(ctx context.Context, storeID uuid.UUID, c LoyaltyConfig) error {
	if c.EarnRateCents < 1 {
		c.EarnRateCents = 100000 // Rp 1.000 default
	}
	if c.RedeemRateCents < 1 {
		c.RedeemRateCents = 100000
	}
	_, err := r.pool.Exec(ctx, `
		UPDATE stores
		SET loyalty_enabled = $2,
		    loyalty_earn_rate_cents = $3,
		    loyalty_redeem_rate_cents = $4,
		    updated_at = now()
		WHERE id = $1
	`, storeID, c.Enabled, c.EarnRateCents, c.RedeemRateCents)
	return err
}

// PrinterConfig holds per-store receipt print preferences.
type PrinterConfig struct {
	Method     string // "browser" | "bluetooth"
	PaperWidth string // "58" | "80"
	AutoPrint  bool
	Copies     int
	Header     string
	Footer     string
}

func (r *POSRepo) GetPrinterConfig(ctx context.Context, storeID uuid.UUID) (*PrinterConfig, error) {
	var c PrinterConfig
	err := r.pool.QueryRow(ctx,
		`SELECT printer_method, printer_paper_width, printer_auto_print,
		        printer_copies, printer_header, printer_footer
		 FROM stores WHERE id = $1`,
		storeID,
	).Scan(&c.Method, &c.PaperWidth, &c.AutoPrint, &c.Copies, &c.Header, &c.Footer)
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *POSRepo) UpdatePrinterConfig(ctx context.Context, storeID uuid.UUID, c PrinterConfig) error {
	// Normalise to the allowed values; fall back to safe defaults.
	if c.Method != "bluetooth" {
		c.Method = "browser"
	}
	if c.PaperWidth != "80" {
		c.PaperWidth = "58"
	}
	if c.Copies < 1 {
		c.Copies = 1
	}
	if c.Copies > 5 {
		c.Copies = 5
	}
	_, err := r.pool.Exec(ctx, `
		UPDATE stores
		SET printer_method = $2,
		    printer_paper_width = $3,
		    printer_auto_print = $4,
		    printer_copies = $5,
		    printer_header = $6,
		    printer_footer = $7,
		    updated_at = now()
		WHERE id = $1
	`, storeID, c.Method, c.PaperWidth, c.AutoPrint, c.Copies,
		strings.TrimSpace(c.Header), strings.TrimSpace(c.Footer))
	return err
}

// LookupCustomerByPhone finds a customer in a store with their loyalty balance.
func (r *POSRepo) LookupCustomerByPhone(ctx context.Context, storeID uuid.UUID, phone string) (*LoyaltyCustomer, error) {
	phone = strings.TrimSpace(phone)
	if phone == "" {
		return nil, errors.New("nomor wajib diisi")
	}
	var c LoyaltyCustomer
	err := r.pool.QueryRow(ctx, `
		SELECT id, name, whatsapp_number, loyalty_points, total_orders, total_spent_cents
		FROM customers
		WHERE store_id = $1 AND whatsapp_number = $2
	`, storeID, phone).Scan(
		&c.ID, &c.Name, &c.WhatsApp, &c.LoyaltyPoints, &c.TotalOrders, &c.TotalSpentCents,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil // not found — not an error
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

// SearchCustomersForPOS — fuzzy match by name OR whatsapp number.
// Untuk customer picker modal di cart panel. Empty query returns recent customers.
func (r *POSRepo) SearchCustomersForPOS(ctx context.Context, storeID uuid.UUID, q string, limit int) ([]LoyaltyCustomer, error) {
	q = strings.TrimSpace(q)
	if limit <= 0 || limit > 50 {
		limit = 10
	}
	var rows pgx.Rows
	var err error
	if q == "" {
		rows, err = r.pool.Query(ctx, `
			SELECT id, name, whatsapp_number, loyalty_points, total_orders, total_spent_cents
			FROM customers
			WHERE store_id = $1
			ORDER BY last_order_at DESC NULLS LAST
			LIMIT $2
		`, storeID, limit)
	} else {
		pat := "%" + q + "%"
		rows, err = r.pool.Query(ctx, `
			SELECT id, name, whatsapp_number, loyalty_points, total_orders, total_spent_cents
			FROM customers
			WHERE store_id = $1
			  AND (name ILIKE $2 OR whatsapp_number LIKE $2)
			ORDER BY last_order_at DESC NULLS LAST
			LIMIT $3
		`, storeID, pat, limit)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []LoyaltyCustomer
	for rows.Next() {
		var c LoyaltyCustomer
		if err := rows.Scan(&c.ID, &c.Name, &c.WhatsApp, &c.LoyaltyPoints,
			&c.TotalOrders, &c.TotalSpentCents); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// ListLoyaltyTransactions returns the loyalty history for a customer.
func (r *POSRepo) ListLoyaltyTransactions(ctx context.Context, customerID, storeID uuid.UUID) ([]LoyaltyTransaction, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, store_id, customer_id, order_id, type, points, balance_after, reason, created_at
		FROM loyalty_transactions
		WHERE customer_id = $1 AND store_id = $2
		ORDER BY created_at DESC
		LIMIT 50
	`, customerID, storeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []LoyaltyTransaction
	for rows.Next() {
		var t LoyaltyTransaction
		if err := rows.Scan(&t.ID, &t.StoreID, &t.CustomerID, &t.OrderID,
			&t.Type, &t.Points, &t.BalanceAfter, &t.Reason, &t.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// applyLoyaltyTx mutates customer balance + inserts loyalty transaction row.
// points is signed — positive for earn, negative for redeem.
func applyLoyaltyTx(ctx context.Context, tx pgx.Tx, storeID, customerID uuid.UUID, orderID *uuid.UUID, points int, kind, reason string) error {
	// Atomic update with guard against negative balance for redeems.
	var newBalance int
	if points < 0 {
		// Redeem: require sufficient balance.
		if err := tx.QueryRow(ctx, `
			UPDATE customers
			SET loyalty_points = loyalty_points + $2
			WHERE id = $1 AND loyalty_points >= $3
			RETURNING loyalty_points
		`, customerID, points, -points).Scan(&newBalance); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrInsufficientPoints
			}
			return err
		}
	} else {
		if err := tx.QueryRow(ctx, `
			UPDATE customers
			SET loyalty_points = loyalty_points + $2
			WHERE id = $1
			RETURNING loyalty_points
		`, customerID, points).Scan(&newBalance); err != nil {
			return err
		}
	}
	_, err := tx.Exec(ctx, `
		INSERT INTO loyalty_transactions
		    (store_id, customer_id, order_id, type, points, balance_after, reason)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, storeID, customerID, orderID, kind, points, newBalance, reason)
	return err
}

// GetOrderPayments returns the per-method payment breakdown for an order.
func (r *POSRepo) GetOrderPayments(ctx context.Context, orderID uuid.UUID) ([]POSPayment, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT method, amount_cents,
		       COALESCE(card_brand, ''), COALESCE(card_last4, ''),
		       COALESCE(reference_number, ''), COALESCE(approval_code, '')
		FROM pos_order_payments WHERE order_id = $1 ORDER BY created_at
	`, orderID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []POSPayment
	for rows.Next() {
		var p POSPayment
		if err := rows.Scan(&p.Method, &p.AmountCents,
			&p.CardBrand, &p.CardLast4, &p.ReferenceNumber, &p.ApprovalCode); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}
