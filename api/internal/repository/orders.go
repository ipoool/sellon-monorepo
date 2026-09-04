package repository

import (
	"context"
	cryptorand "crypto/rand"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ComputeTaxCents returns the tax amount (cents) for a taxable base, given the
// rate in basis points (1100 = 11%). When inclusive, the base already contains
// the tax and this returns the embedded portion (base − base/(1+rate)); the
// order total is unchanged. When exclusive, it returns base·rate (added on top).
// Shared by the storefront and POS order paths so they agree exactly.
func ComputeTaxCents(base int64, bps int, inclusive bool) int64 {
	if bps <= 0 || base <= 0 {
		return 0
	}
	if inclusive {
		return int64(math.Round(float64(base) * float64(bps) / float64(10000+bps)))
	}
	return int64(math.Round(float64(base) * float64(bps) / 10000.0))
}

type Order struct {
	ID                 uuid.UUID
	StoreID            uuid.UUID
	OrderNumber        string
	Status             string
	PaymentStatus      string
	PaymentMethod      string
	Source             string // "storefront" | "pos" | "whatsapp"
	SubtotalCents      int64
	ShippingCents      int64
	DiscountCents      int64
	TaxCents           int64
	TaxBps             int
	TaxInclusive       bool
	PromoCode          string
	TotalCents         int64
	Courier            string
	CourierService     string
	TrackingNumber     string
	CustomerName       string
	CustomerWhatsApp   string
	CustomerEmail      string
	CustomerAddress    string
	CustomerCity       string
	Notes              string
	SellerNotes        string
	NeedsReview        bool // offline-synced order that overdrew stock
	ReviewReason       string
	PaymentURL         string
	PaidAt             *time.Time
	ShippedAt          *time.Time
	CompletedAt        *time.Time
	CancelledAt        *time.Time
	CancellationReason string
	RefundAmountCents  int64
	RefundReason       string
	RefundedAt         *time.Time
	// Bukti transfer manual yang di-upload pembeli (untuk pembayaran
	// non-gateway: transfer manual, QRIS statis, WA konfirmasi).
	PaymentProofURL  string
	PaymentProofNote string
	PaymentProofAt   *time.Time
	// Loyalty redemption applied to this order (POS). LoyaltyDiscountCents is
	// the portion of discount_cents that came from redeeming points.
	LoyaltyPointsRedeemed int
	LoyaltyDiscountCents  int64
	// POS reprint data: cash given back, the shift this order belongs to, and
	// the cashier who rang it (resolved via pos_session → opened_by). Zero/nil
	// for non-POS orders.
	ChangeAmountCents int64
	PosSessionID      *uuid.UUID
	CashierName       string
	// Dine-in / kitchen pipeline (NULL/empty for non-kitchen orders).
	QueueNumber   *int
	KitchenStatus *string
	ServingType   string
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

type OrderItem struct {
	ID             uuid.UUID
	ProductID      *uuid.UUID
	ProductName    string
	VariantName    string
	UnitPriceCents int64
	Quantity       int
	SubtotalCents  int64
	ProductType    string // "physical" | "digital"
	ServingType    string // "" | "dine_in" | "takeaway"
	// Access validity snapshot from the product, populated by
	// PrepareDigitalFulfillment so the fulfiller can set the token's expires_at.
	// Unit 'lifetime' (value 0) = no expiry.
	AccessValidityValue int
	AccessValidityUnit  string
}

type OrderItemInput struct {
	ProductID   uuid.UUID
	VariantID   *uuid.UUID
	ProductName string
	VariantName string
	UnitCents   int64
	Quantity    int
	ProductType string // "physical" | "digital" — when "digital", Create skips stock decrement
	// DigitalStockLimit, when non-nil, is a non-physical product's remaining sales
	// quota: Create atomically decrements it (oversell-safe). nil = unlimited.
	DigitalStockLimit *int
	// Modifiers are the chosen option snapshots for this line (already
	// validated + priced by the handler). UnitCents already includes their
	// price deltas.
	Modifiers []OptionSnapshot
}

type CreateOrderInput struct {
	StoreID         uuid.UUID
	CustomerName    string
	CustomerWA      string
	CustomerEmail   string // optional for physical orders, required at handler level for digital
	CustomerAddress string
	CustomerCity    string
	Courier         string
	PaymentMethod   string
	Notes           string
	ShippingCents   int64
	DiscountCents   int64      // applied to subtotal
	PromoCode       string     // for record-keeping
	PromoID         *uuid.UUID // FK if redeemed (nil means no promo)
	Items           []OrderItemInput
	// Dine-in self-order routing (set by the table-QR flow).
	TableID       *uuid.UUID
	ServingType   string // "dine_in" | "takeaway" | ""
	KitchenStatus string // "queued" to route into the kitchen now; "" otherwise
	// CustomFields is a JSON array snapshot [{key,label,value}] of the
	// seller-configured custom checkout fields the buyer filled in. nil/empty
	// stores an empty array.
	CustomFields []byte
	// Source is the order channel ("storefront" | "pos" | "whatsapp" |
	// "kiosk"). Empty defaults to "storefront".
	Source string
	// Tax config snapshot. TaxBps=0 → no tax. Tax base = subtotal − discount.
	TaxBps       int
	TaxInclusive bool
	// IdempotencyKey (optional, client-generated) makes a retried checkout
	// return the original order instead of creating a second one. Backed by
	// the partial unique index on (store_id, idempotency_key) from 0090.
	IdempotencyKey string
}

type OrderRepo struct {
	pool *pgxpool.Pool
}

func NewOrderRepo(pool *pgxpool.Pool) *OrderRepo {
	return &OrderRepo{pool: pool}
}

type ListOrdersFilter struct {
	StoreID       uuid.UUID
	Search        string   // matches order_number or customer_name
	Status        string   // "" = all (single-value, legacy callers)
	Statuses      []string // non-empty = filter to this set (status = ANY); takes precedence over Status
	PaymentStatus string   // "" = all
	NeedsReview   bool     // true = only orders flagged for review (offline sync conflicts)
	Limit         int
	Offset        int
}

func (r *OrderRepo) ListByStore(ctx context.Context, storeID uuid.UUID, limit int) ([]Order, error) {
	rows, _, err := r.List(ctx, ListOrdersFilter{StoreID: storeID, Limit: limit})
	return rows, err
}

// List returns rows + the total row count matching the filter (so callers
// can render server-side pagination without a second query).
func (r *OrderRepo) List(ctx context.Context, f ListOrdersFilter) ([]Order, int, error) {
	rows, total, _, err := r.list(ctx, f, false)
	return rows, total, err
}

// ListWithCounts is List plus the store-wide per-status counts the Pesanan tab
// badges need. Both numbers come out of a SINGLE scan of the store's orders
// (COUNT(*) FILTER for the filtered total, GROUP BY status for the badges) —
// the page used to run two separate store-wide COUNT(*) queries per load.
func (r *OrderRepo) ListWithCounts(ctx context.Context, f ListOrdersFilter) ([]Order, int, map[string]int, error) {
	return r.list(ctx, f, true)
}

func (r *OrderRepo) list(ctx context.Context, f ListOrdersFilter, withCounts bool) ([]Order, int, map[string]int, error) {
	if f.Limit <= 0 || f.Limit > 1000 {
		f.Limit = 50
	}
	if f.Offset < 0 {
		f.Offset = 0
	}
	args := []any{f.StoreID}
	// `cond` holds every filter EXCEPT store_id, so the counting query can
	// reuse it inside a COUNT(*) FILTER over the store's rows.
	cond := ""
	if f.Search != "" {
		args = append(args, "%"+f.Search+"%")
		cond += " AND (order_number ILIKE $2 OR customer_name ILIKE $2)"
	}
	if len(f.Statuses) > 0 {
		// Tab-style grouping (e.g. "Perlu Diproses" = pending+confirmed+processing).
		args = append(args, f.Statuses)
		cond += " AND status = ANY($" + itoa(len(args)) + ")"
	} else if f.Status != "" {
		args = append(args, f.Status)
		cond += " AND status = $" + itoa(len(args))
	}
	if f.PaymentStatus != "" {
		args = append(args, f.PaymentStatus)
		cond += " AND payment_status = $" + itoa(len(args))
	}
	if f.NeedsReview {
		cond += " AND needs_review = true"
	}
	where := "store_id = $1" + cond

	var total int
	counts := map[string]int{}
	if withCounts {
		// One pass: per-status badge counts (store-wide, filter-independent)
		// and the filtered total, summed from the same GROUP BY.
		filterExpr := "true"
		if cond != "" {
			filterExpr = strings.TrimPrefix(strings.TrimSpace(cond), "AND ")
		}
		cRows, err := r.pool.Query(ctx, `
			SELECT status, COUNT(*), COUNT(*) FILTER (WHERE `+filterExpr+`)
			FROM orders WHERE store_id = $1
			GROUP BY status
		`, args...)
		if err != nil {
			return nil, 0, nil, err
		}
		for cRows.Next() {
			var status string
			var all, matched int
			if err := cRows.Scan(&status, &all, &matched); err != nil {
				cRows.Close()
				return nil, 0, nil, err
			}
			counts[status] = all
			total += matched
		}
		cRows.Close()
		if err := cRows.Err(); err != nil {
			return nil, 0, nil, err
		}
	} else if err := r.pool.QueryRow(ctx,
		"SELECT COUNT(*) FROM orders WHERE "+where, args...,
	).Scan(&total); err != nil {
		return nil, 0, nil, err
	}

	args = append(args, f.Limit, f.Offset)
	q := `
		SELECT id, store_id, order_number, status, payment_status, payment_method,
		       subtotal_cents, shipping_cents, discount_cents, tax_cents, total_cents, courier,
		       customer_name, customer_whatsapp, customer_city, needs_review, review_reason, created_at
		FROM orders
		WHERE ` + where + `
		ORDER BY created_at DESC
		LIMIT $` + itoa(len(args)-1) + ` OFFSET $` + itoa(len(args))

	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, 0, nil, err
	}
	defer rows.Close()

	var out []Order
	for rows.Next() {
		var o Order
		if err := rows.Scan(
			&o.ID, &o.StoreID, &o.OrderNumber, &o.Status, &o.PaymentStatus, &o.PaymentMethod,
			&o.SubtotalCents, &o.ShippingCents, &o.DiscountCents, &o.TaxCents, &o.TotalCents, &o.Courier,
			&o.CustomerName, &o.CustomerWhatsApp, &o.CustomerCity, &o.NeedsReview, &o.ReviewReason, &o.CreatedAt,
		); err != nil {
			return nil, 0, nil, err
		}
		out = append(out, o)
	}
	return out, total, counts, rows.Err()
}

func (r *OrderRepo) ListByCustomer(ctx context.Context, storeID, customerID uuid.UUID, limit int) ([]Order, error) {
	if limit <= 0 || limit > 200 {
		limit = 25
	}
	rows, err := r.pool.Query(ctx, `
		SELECT id, store_id, order_number, status, payment_status, payment_method,
		       subtotal_cents, shipping_cents, total_cents, courier,
		       customer_name, customer_whatsapp, customer_city, created_at
		FROM orders
		WHERE store_id = $1 AND customer_id = $2
		ORDER BY created_at DESC
		LIMIT $3
	`, storeID, customerID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Order
	for rows.Next() {
		var o Order
		if err := rows.Scan(
			&o.ID, &o.StoreID, &o.OrderNumber, &o.Status, &o.PaymentStatus, &o.PaymentMethod,
			&o.SubtotalCents, &o.ShippingCents, &o.TotalCents, &o.Courier,
			&o.CustomerName, &o.CustomerWhatsApp, &o.CustomerCity, &o.CreatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, o)
	}
	return out, rows.Err()
}

func (r *OrderRepo) StatsForStore(ctx context.Context, storeID uuid.UUID) (todayCount int, monthRevenueCents int64, err error) {
	// Month revenue excludes cancelled orders even when paid — they were
	// almost certainly refunded out of band (see BUG-012).
	err = r.pool.QueryRow(ctx, `
		SELECT
		    COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now())),
		    COALESCE(SUM(total_cents) FILTER (WHERE created_at >= date_trunc('month', now()) AND payment_status = 'paid' AND status <> 'cancelled'), 0)
		FROM orders WHERE store_id = $1
	`, storeID).Scan(&todayCount, &monthRevenueCents)
	return
}

// CountsByStatus returns a map of status → row count across the whole store
// (no date/search filter), used to render the order-tab badge counts.
func (r *OrderRepo) CountsByStatus(ctx context.Context, storeID uuid.UUID) (map[string]int, error) {
	rows, err := r.pool.Query(ctx,
		"SELECT status, COUNT(*) FROM orders WHERE store_id = $1 GROUP BY status",
		storeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make(map[string]int)
	for rows.Next() {
		var status string
		var n int
		if err := rows.Scan(&status, &n); err != nil {
			return nil, err
		}
		out[status] = n
	}
	return out, rows.Err()
}

var ErrOrderNotFound = errors.New("order not found")
var ErrInvalidTransition = errors.New("invalid status transition")

// SetPaymentProof menyimpan URL bukti transfer + catatan pembeli pada
// order. Dipanggil dari endpoint storefront (no-auth) — caller pastikan
// order_number + store_slug match. Idempotent: kalau pembeli upload
// ulang, baris di-overwrite (note + timestamp ikut update).
func (r *OrderRepo) SetPaymentProof(ctx context.Context, orderID uuid.UUID, proofURL, note string) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE orders
		SET payment_proof_url = $2,
		    payment_proof_note = $3,
		    payment_proof_at = now(),
		    updated_at = now()
		WHERE id = $1
	`, orderID, proofURL, note)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrOrderNotFound
	}
	return nil
}

// FindByID returns full order with all fields. Tenant-isolated by storeID.
// GetCustomFields returns the raw JSON snapshot of custom checkout fields for
// an order (caller is responsible for having validated access to the order).
func (r *OrderRepo) GetCustomFields(ctx context.Context, orderID uuid.UUID) ([]byte, error) {
	var cf []byte
	err := r.pool.QueryRow(ctx,
		`SELECT custom_fields FROM orders WHERE id = $1`, orderID).Scan(&cf)
	return cf, err
}

func (r *OrderRepo) FindByID(ctx context.Context, storeID, id uuid.UUID) (*Order, error) {
	// Columns are o.-qualified because of the POS LEFT JOINs (pos_sessions/users
	// share column names like id/created_at). The joins resolve the original
	// cashier for POS reprint; they yield at most one row (unique session+user).
	const q = `
		SELECT o.id, o.store_id, o.order_number, o.status, o.payment_status, o.payment_method, o.source,
		       o.subtotal_cents, o.shipping_cents, o.discount_cents, o.promo_code, o.total_cents,
		       o.courier, o.courier_service, o.tracking_number,
		       o.customer_name, o.customer_whatsapp, o.customer_email, o.customer_address, o.customer_city,
		       o.notes, o.seller_notes, o.payment_url,
		       o.paid_at, o.shipped_at, o.completed_at, o.cancelled_at, o.cancellation_reason,
		       o.refund_amount_cents, o.refund_reason, o.refunded_at,
		       o.payment_proof_url, o.payment_proof_note, o.payment_proof_at,
		       o.loyalty_points_redeemed, o.loyalty_discount_cents,
		       o.tax_cents, o.tax_bps, o.tax_inclusive,
		       o.change_amount_cents, o.pos_session_id, COALESCE(u.name, u.email, ''),
		       o.created_at, o.updated_at
		FROM orders o
		LEFT JOIN pos_sessions ps ON ps.id = o.pos_session_id
		LEFT JOIN users u ON u.id = ps.opened_by
		WHERE o.id = $1 AND o.store_id = $2
	`
	var o Order
	err := r.pool.QueryRow(ctx, q, id, storeID).Scan(
		&o.ID, &o.StoreID, &o.OrderNumber, &o.Status, &o.PaymentStatus, &o.PaymentMethod, &o.Source,
		&o.SubtotalCents, &o.ShippingCents, &o.DiscountCents, &o.PromoCode, &o.TotalCents,
		&o.Courier, &o.CourierService, &o.TrackingNumber,
		&o.CustomerName, &o.CustomerWhatsApp, &o.CustomerEmail, &o.CustomerAddress, &o.CustomerCity,
		&o.Notes, &o.SellerNotes, &o.PaymentURL,
		&o.PaidAt, &o.ShippedAt, &o.CompletedAt, &o.CancelledAt, &o.CancellationReason,
		&o.RefundAmountCents, &o.RefundReason, &o.RefundedAt,
		&o.PaymentProofURL, &o.PaymentProofNote, &o.PaymentProofAt,
		&o.LoyaltyPointsRedeemed, &o.LoyaltyDiscountCents,
		&o.TaxCents, &o.TaxBps, &o.TaxInclusive,
		&o.ChangeAmountCents, &o.PosSessionID, &o.CashierName,
		&o.CreatedAt, &o.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrOrderNotFound
	}
	if err != nil {
		return nil, err
	}
	return &o, nil
}

func (r *OrderRepo) ListItems(ctx context.Context, orderID uuid.UUID) ([]OrderItem, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, product_id, product_name, variant_name, unit_price_cents, quantity, subtotal_cents, product_type, serving_type
		FROM order_items WHERE order_id = $1 ORDER BY created_at ASC
	`, orderID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []OrderItem
	for rows.Next() {
		var it OrderItem
		if err := rows.Scan(
			&it.ID, &it.ProductID, &it.ProductName, &it.VariantName,
			&it.UnitPriceCents, &it.Quantity, &it.SubtotalCents, &it.ProductType, &it.ServingType,
		); err != nil {
			return nil, err
		}
		out = append(out, it)
	}
	return out, rows.Err()
}

// ListModifiersByOrder batch-loads chosen modifier snapshots for all lines of
// an order, keyed by order_item_id. Used by receipts / order detail.
func (r *OrderRepo) ListModifiersByOrder(ctx context.Context, orderID uuid.UUID) (map[uuid.UUID][]OptionSnapshot, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT oim.order_item_id, oim.option_id, oim.group_name, oim.option_name, oim.price_delta_cents
		FROM order_item_modifiers oim
		JOIN order_items oi ON oi.id = oim.order_item_id
		WHERE oi.order_id = $1
		ORDER BY oim.created_at ASC
	`, orderID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[uuid.UUID][]OptionSnapshot{}
	for rows.Next() {
		var itemID uuid.UUID
		var optID *uuid.UUID
		var s OptionSnapshot
		if err := rows.Scan(&itemID, &optID, &s.GroupName, &s.OptionName, &s.PriceDeltaCents); err != nil {
			return nil, err
		}
		if optID != nil {
			s.OptionID = *optID
		}
		out[itemID] = append(out[itemID], s)
	}
	return out, rows.Err()
}

// OrderPayment is one tender line from pos_order_payments (POS split/EDC). Used
// to render a faithful POS receipt (per-method breakdown). EDC fields are empty
// for non-card methods.
type OrderPayment struct {
	Method          string
	AmountCents     int64
	CardBrand       string
	CardLast4       string
	ReferenceNumber string
	ApprovalCode    string
}

// ListOrderPayments loads the per-method tender lines for a POS order. Returns
// an empty slice for storefront orders (which have no pos_order_payments rows).
func (r *OrderRepo) ListOrderPayments(ctx context.Context, orderID uuid.UUID) ([]OrderPayment, error) {
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
	var out []OrderPayment
	for rows.Next() {
		var p OrderPayment
		if err := rows.Scan(&p.Method, &p.AmountCents,
			&p.CardBrand, &p.CardLast4, &p.ReferenceNumber, &p.ApprovalCode); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// Confirm transitions pending -> confirmed. Idempotent on already-confirmed.
func (r *OrderRepo) Confirm(ctx context.Context, storeID, id uuid.UUID) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE orders SET status = 'confirmed', updated_at = now()
		WHERE id = $1 AND store_id = $2 AND status = 'pending'
	`, id, storeID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrInvalidTransition
	}
	return nil
}

// Process transitions confirmed -> processing.
func (r *OrderRepo) Process(ctx context.Context, storeID, id uuid.UUID) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE orders SET status = 'processing', updated_at = now()
		WHERE id = $1 AND store_id = $2 AND status = 'confirmed'
	`, id, storeID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrInvalidTransition
	}
	return nil
}

// Ship transitions confirmed/processing -> shipped, requires tracking number.
func (r *OrderRepo) Ship(ctx context.Context, storeID, id uuid.UUID, courier, service, tracking string) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE orders SET status = 'shipped',
		    courier = COALESCE(NULLIF($3, ''), courier),
		    courier_service = COALESCE(NULLIF($4, ''), courier_service),
		    tracking_number = $5,
		    shipped_at = now(),
		    updated_at = now()
		WHERE id = $1 AND store_id = $2 AND status IN ('confirmed', 'processing')
	`, id, storeID, courier, service, tracking)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrInvalidTransition
	}
	return nil
}

// Complete transitions shipped -> completed.
func (r *OrderRepo) Complete(ctx context.Context, storeID, id uuid.UUID) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE orders SET status = 'completed', completed_at = now(), updated_at = now()
		WHERE id = $1 AND store_id = $2 AND status = 'shipped'
	`, id, storeID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrInvalidTransition
	}
	return nil
}

// Cancel transitions any non-final order -> cancelled with optional reason.
func (r *OrderRepo) Cancel(ctx context.Context, storeID, id uuid.UUID, reason string) error {
	return r.cancel(ctx, storeID, id, reason, "")
}

// CancelIfUnpaid is Cancel with an extra payment guard applied inside the same
// UPDATE: the row must still be payment_status='unpaid' AND carry no buyer
// payment proof. Used by the lazy-expiry path on the public buyer order page,
// which otherwise races the Midtrans webhook — the page reads "unpaid", the
// webhook settles the order and mints download tokens, and the page's cancel
// lands second, leaving status='cancelled' on a paid order whose stock, kuota
// and promo allocation have all been released. Postgres re-evaluates the
// UPDATE qual against the winning row version, so the guard is atomic with the
// write. Returns ErrInvalidTransition when no row matches (i.e. it got paid,
// or proof was uploaded, or it was already final).
func (r *OrderRepo) CancelIfUnpaid(ctx context.Context, storeID, id uuid.UUID, reason string) error {
	return r.cancel(ctx, storeID, id, reason,
		" AND payment_status = 'unpaid' AND COALESCE(payment_proof_url, '') = ''")
}

// cancel does the actual work for Cancel / CancelIfUnpaid. extraGuard is
// appended verbatim to the UPDATE's WHERE clause (callers only ever pass
// constant SQL — never user input).
func (r *OrderRepo) cancel(ctx context.Context, storeID, id uuid.UUID, reason, extraGuard string) error {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	tag, err := tx.Exec(ctx, `
		UPDATE orders SET status = 'cancelled',
		    cancellation_reason = $3,
		    cancelled_at = now(),
		    updated_at = now()
		WHERE id = $1 AND store_id = $2 AND status NOT IN ('completed', 'cancelled')`+extraGuard+`
	`, id, storeID, reason)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrInvalidTransition
	}

	// Restore stock for every line item — orders that get to "cancelled"
	// should give the stock back so the seller can sell it again.
	// Digital items skip this (they had no stock decrement to begin with).
	if _, err := tx.Exec(ctx, `
		UPDATE products p
		SET stock = p.stock + oi.quantity, updated_at = now()
		FROM order_items oi
		WHERE oi.order_id = $1
		  AND oi.product_id = p.id
		  AND oi.variant_id IS NULL
		  AND oi.product_type = 'physical'
	`, id); err != nil {
		return fmt.Errorf("restore product stock: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		UPDATE product_variants pv
		SET stock = pv.stock + oi.quantity
		FROM order_items oi
		WHERE oi.order_id = $1
		  AND oi.variant_id = pv.id
		  AND oi.product_type = 'physical'
	`, id); err != nil {
		return fmt.Errorf("restore variant stock: %w", err)
	}

	// Restore the digital "kuota" (sales cap) for non-physical line items.
	// Only products that still have a limit set (digital_stock_limit IS NOT
	// NULL) — if the seller switched it off since the order, it's unlimited
	// now and there's nothing to give back.
	if _, err := tx.Exec(ctx, `
		UPDATE products p
		SET digital_stock_limit = p.digital_stock_limit + oi.quantity, updated_at = now()
		FROM order_items oi
		WHERE oi.order_id = $1
		  AND oi.product_id = p.id
		  AND oi.product_type <> 'physical'
		  AND p.digital_stock_limit IS NOT NULL
	`, id); err != nil {
		return fmt.Errorf("restore digital kuota: %w", err)
	}

	// Return the promo allocation back to its pool. Mirrors the stock
	// restore above — sellers running scarcity-style campaigns shouldn't
	// have their quota burned by cancelled orders. GREATEST guards against
	// going negative if the original increment was somehow lost (BUG-013).
	// The subquery yields NULL for orders without a promo, which matches
	// no row.
	if _, err := tx.Exec(ctx, `
		UPDATE promos SET used_count = GREATEST(0, used_count - 1),
		                  updated_at = now()
		WHERE id = (
		    SELECT promo_id FROM orders
		    WHERE id = $1 AND promo_id IS NOT NULL
		)
	`, id); err != nil {
		return fmt.Errorf("decrement promo usage: %w", err)
	}

	// Give BOM materials back to stock (idempotent; writes compensating
	// 'restore' ledger rows). Mirrors the product-stock restore above.
	if err := reverseConsumptionTx(ctx, tx, storeID, id); err != nil {
		return fmt.Errorf("restore material stock: %w", err)
	}

	return tx.Commit(ctx)
}

// ErrRefundNotAllowed is returned by Refund when the order is not in a state
// that can be refunded (must be paid, must not already be refunded, amount
// must be > 0 and <= total_cents).
var ErrRefundNotAllowed = errors.New("refund not allowed")

// Refund records that the seller refunded the buyer out of band (via their
// Midtrans dashboard or a manual transfer). SellOn is a facilitator and never
// holds buyer funds, so this method only updates DB state — money movement
// is the seller's responsibility.
//
// Validation:
//   - Order must be paid (payment_status = 'paid').
//   - Order must not already be refunded.
//   - amountCents must be > 0 and <= total_cents.
//
// Side effects:
//   - payment_status → 'refunded', refunded_at = now(), refund_amount_cents,
//     refund_reason recorded.
//   - If the order is not already cancelled, status → 'cancelled' and stock is
//     restored for every physical line item (mirrors Cancel). This guarantees
//     a refunded order never sits in a non-final fulfillment state.
//   - Promo usage decrement mirrors Cancel for the same reason.
func (r *OrderRepo) Refund(ctx context.Context, storeID, id uuid.UUID, amountCents int64, reason string) error {
	if amountCents <= 0 {
		return ErrRefundNotAllowed
	}
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Atomic gate: only paid + non-refunded rows transition. The CHECK on
	// amount <= total_cents lives here so concurrent edits to total can't
	// let a stale refund through.
	var prevStatus string
	err = tx.QueryRow(ctx, `
		UPDATE orders
		SET payment_status = 'refunded',
		    refund_amount_cents = $3,
		    refund_reason = $4,
		    refunded_at = now(),
		    refund_pending = false,
		    updated_at = now()
		WHERE id = $1 AND store_id = $2
		  AND payment_status = 'paid'
		  AND refunded_at IS NULL
		  AND $3 <= total_cents
		RETURNING status
	`, id, storeID, amountCents, reason).Scan(&prevStatus)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrRefundNotAllowed
	}
	if err != nil {
		return fmt.Errorf("update order refund: %w", err)
	}

	// If the order wasn't already cancelled, transition it now and restore
	// stock + promo. We mirror Cancel's logic so refunded orders never leak
	// stock or skew promo counters.
	if prevStatus != "cancelled" {
		if _, err := tx.Exec(ctx, `
			UPDATE orders
			SET status = 'cancelled',
			    cancellation_reason = COALESCE(NULLIF($3, ''), 'Refund'),
			    cancelled_at = COALESCE(cancelled_at, now()),
			    updated_at = now()
			WHERE id = $1 AND store_id = $2
		`, id, storeID, reason); err != nil {
			return fmt.Errorf("cancel on refund: %w", err)
		}

		if _, err := tx.Exec(ctx, `
			UPDATE products p
			SET stock = p.stock + oi.quantity, updated_at = now()
			FROM order_items oi
			WHERE oi.order_id = $1
			  AND oi.product_id = p.id
			  AND oi.variant_id IS NULL
			  AND oi.product_type = 'physical'
		`, id); err != nil {
			return fmt.Errorf("restore product stock on refund: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			UPDATE product_variants pv
			SET stock = pv.stock + oi.quantity
			FROM order_items oi
			WHERE oi.order_id = $1
			  AND oi.variant_id = pv.id
			  AND oi.product_type = 'physical'
		`, id); err != nil {
			return fmt.Errorf("restore variant stock on refund: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			UPDATE products p
			SET digital_stock_limit = p.digital_stock_limit + oi.quantity, updated_at = now()
			FROM order_items oi
			WHERE oi.order_id = $1
			  AND oi.product_id = p.id
			  AND oi.product_type <> 'physical'
			  AND p.digital_stock_limit IS NOT NULL
		`, id); err != nil {
			return fmt.Errorf("restore digital kuota on refund: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			UPDATE promos SET used_count = GREATEST(0, used_count - 1),
			                  updated_at = now()
			WHERE id = (
			    SELECT promo_id FROM orders
			    WHERE id = $1 AND promo_id IS NOT NULL
			)
		`, id); err != nil {
			return fmt.Errorf("decrement promo usage on refund: %w", err)
		}
		if err := reverseConsumptionTx(ctx, tx, storeID, id); err != nil {
			return fmt.Errorf("restore material stock on refund: %w", err)
		}
	}

	return tx.Commit(ctx)
}

// RefundClaim is the snapshot returned by ClaimRefund — enough for the caller
// to talk to the payment gateway without a second read.
type RefundClaim struct {
	OrderNumber   string
	PaymentMethod string
	TotalCents    int64
}

// ClaimRefund atomically reserves the refund slot for an order BEFORE any
// money is moved. All the validation that used to live in Refund (and ran
// only AFTER the gateway call) happens here: the order must be paid, not
// already refunded, have no other refund in flight, and the amount must fit
// inside the order total.
//
// The caller must either finish with Refund (which clears the flag) or call
// ReleaseRefundClaim when the gateway rejects the refund. Returns
// ErrRefundNotAllowed when nothing could be claimed — including the
// double-submit case, which is exactly what stops money moving twice.
func (r *OrderRepo) ClaimRefund(ctx context.Context, storeID, id uuid.UUID, amountCents int64) (*RefundClaim, error) {
	if amountCents <= 0 {
		return nil, ErrRefundNotAllowed
	}
	var c RefundClaim
	err := r.pool.QueryRow(ctx, `
		UPDATE orders
		SET refund_pending = true, updated_at = now()
		WHERE id = $1 AND store_id = $2
		  AND payment_status = 'paid'
		  AND refunded_at IS NULL
		  AND refund_pending = false
		  AND $3 <= total_cents
		RETURNING order_number, payment_method, total_cents
	`, id, storeID, amountCents).Scan(&c.OrderNumber, &c.PaymentMethod, &c.TotalCents)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrRefundNotAllowed
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

// ReleaseRefundClaim undoes ClaimRefund so the seller can retry after a
// gateway rejection. Never clears the flag on an order that already settled
// its refund.
func (r *OrderRepo) ReleaseRefundClaim(ctx context.Context, storeID, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE orders SET refund_pending = false, updated_at = now()
		WHERE id = $1 AND store_id = $2 AND refunded_at IS NULL
	`, id, storeID)
	return err
}

// RecordPartialRefund books a partial refund that happened outside SellOn
// (typically the seller refunding part of an order from the Midtrans
// dashboard). payment_status stays 'paid' — the order is still a sale, just a
// smaller one — so a later full refund is still possible. Flagged for review
// so the seller sees the money moved.
func (r *OrderRepo) RecordPartialRefund(ctx context.Context, storeID, id uuid.UUID, amountCents int64, reason string) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE orders
		SET refund_amount_cents = $3,
		    refund_reason = $4,
		    needs_review = true,
		    review_reason = 'Refund sebagian dari Midtrans — cek nominal & stok',
		    updated_at = now()
		WHERE id = $1 AND store_id = $2 AND payment_status = 'paid'
	`, id, storeID, amountCents, reason)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrRefundNotAllowed
	}
	return nil
}

// ExpireStaleUnpaid auto-cancels orders left 'pending'/'unpaid' past the cutoff
// with NO payment proof uploaded (buyers who transferred + uploaded proof are
// awaiting seller confirmation, not abandoned — those are never touched).
// Cancelling releases stock + digital kuota + promo allocation, mirroring Cancel.
// One transaction; target rows are locked (FOR UPDATE SKIP LOCKED) so a
// concurrent payment webhook can't pay an order we're expiring. Returns the
// count cancelled.
func (r *OrderRepo) ExpireStaleUnpaid(ctx context.Context, cutoff time.Time) (int, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	rows, err := tx.Query(ctx, `
		SELECT id FROM orders
		WHERE status = 'pending'
		  AND payment_status = 'unpaid'
		  AND created_at < $1
		  AND COALESCE(payment_proof_url, '') = ''
		FOR UPDATE SKIP LOCKED
	`, cutoff)
	if err != nil {
		return 0, fmt.Errorf("select stale orders: %w", err)
	}
	var ids []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return 0, err
		}
		ids = append(ids, id)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}
	if len(ids) == 0 {
		return 0, tx.Commit(ctx)
	}

	// Restore physical product stock.
	if _, err := tx.Exec(ctx, `
		UPDATE products p
		SET stock = p.stock + oi.quantity, updated_at = now()
		FROM order_items oi
		WHERE oi.order_id = ANY($1)
		  AND oi.product_id = p.id
		  AND oi.variant_id IS NULL
		  AND oi.product_type = 'physical'
	`, ids); err != nil {
		return 0, fmt.Errorf("restore product stock: %w", err)
	}
	// Restore variant stock.
	if _, err := tx.Exec(ctx, `
		UPDATE product_variants pv
		SET stock = pv.stock + oi.quantity
		FROM order_items oi
		WHERE oi.order_id = ANY($1)
		  AND oi.variant_id = pv.id
		  AND oi.product_type = 'physical'
	`, ids); err != nil {
		return 0, fmt.Errorf("restore variant stock: %w", err)
	}
	// Restore digital kuota for non-physical items that still have a limit.
	if _, err := tx.Exec(ctx, `
		UPDATE products p
		SET digital_stock_limit = p.digital_stock_limit + oi.quantity, updated_at = now()
		FROM order_items oi
		WHERE oi.order_id = ANY($1)
		  AND oi.product_id = p.id
		  AND oi.product_type <> 'physical'
		  AND p.digital_stock_limit IS NOT NULL
	`, ids); err != nil {
		return 0, fmt.Errorf("restore digital kuota: %w", err)
	}
	// Return promo allocations — one decrement per order that used a promo.
	if _, err := tx.Exec(ctx, `
		UPDATE promos pr
		SET used_count = GREATEST(0, pr.used_count - c.cnt), updated_at = now()
		FROM (
			SELECT promo_id, COUNT(*) AS cnt
			FROM orders
			WHERE id = ANY($1) AND promo_id IS NOT NULL
			GROUP BY promo_id
		) c
		WHERE pr.id = c.promo_id
	`, ids); err != nil {
		return 0, fmt.Errorf("restore promo usage: %w", err)
	}
	// Finally, cancel the orders.
	if _, err := tx.Exec(ctx, `
		UPDATE orders
		SET status = 'cancelled',
		    cancellation_reason = 'Kadaluwarsa — tidak dibayar',
		    cancelled_at = now(),
		    updated_at = now()
		WHERE id = ANY($1)
	`, ids); err != nil {
		return 0, fmt.Errorf("cancel stale orders: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return len(ids), nil
}

// FindByOrderNumber looks up an order by store + order_number (unique pair).
// Used by the webhook handler to map a Midtrans order_id back to our row.
func (r *OrderRepo) FindByOrderNumber(ctx context.Context, storeID uuid.UUID, orderNumber string) (*Order, error) {
	const q = `
		SELECT id, store_id, order_number, status, payment_status, payment_method, source,
		       subtotal_cents, shipping_cents, discount_cents, promo_code, total_cents,
		       courier, courier_service, tracking_number,
		       customer_name, customer_whatsapp, customer_email, customer_address, customer_city,
		       notes, seller_notes, payment_url,
		       paid_at, shipped_at, completed_at, cancelled_at, cancellation_reason,
		       refund_amount_cents, refund_reason, refunded_at,
		       payment_proof_url, payment_proof_note, payment_proof_at,
		       loyalty_points_redeemed, loyalty_discount_cents,
		       tax_cents, tax_bps, tax_inclusive,
		       created_at, updated_at
		FROM orders WHERE store_id = $1 AND order_number = $2
	`
	var o Order
	err := r.pool.QueryRow(ctx, q, storeID, orderNumber).Scan(
		&o.ID, &o.StoreID, &o.OrderNumber, &o.Status, &o.PaymentStatus, &o.PaymentMethod, &o.Source,
		&o.SubtotalCents, &o.ShippingCents, &o.DiscountCents, &o.PromoCode, &o.TotalCents,
		&o.Courier, &o.CourierService, &o.TrackingNumber,
		&o.CustomerName, &o.CustomerWhatsApp, &o.CustomerEmail, &o.CustomerAddress, &o.CustomerCity,
		&o.Notes, &o.SellerNotes, &o.PaymentURL,
		&o.PaidAt, &o.ShippedAt, &o.CompletedAt, &o.CancelledAt, &o.CancellationReason,
		&o.RefundAmountCents, &o.RefundReason, &o.RefundedAt,
		&o.PaymentProofURL, &o.PaymentProofNote, &o.PaymentProofAt,
		&o.LoyaltyPointsRedeemed, &o.LoyaltyDiscountCents,
		&o.TaxCents, &o.TaxBps, &o.TaxInclusive,
		&o.CreatedAt, &o.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrOrderNotFound
	}
	if err != nil {
		return nil, err
	}
	return &o, nil
}

// SetPaymentStatus updates payment_status (+ stamps paid_at if newly paid).
// Used by webhook + manual mark-paid path.
func (r *OrderRepo) SetPaymentStatus(ctx context.Context, storeID, id uuid.UUID, paymentStatus, paymentMethod string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE orders
		SET payment_status = $3,
		    payment_method = COALESCE(NULLIF($4, ''), payment_method),
		    paid_at = CASE WHEN $3 = 'paid' AND paid_at IS NULL THEN now() ELSE paid_at END,
		    updated_at = now()
		WHERE id = $1 AND store_id = $2
	`, id, storeID, paymentStatus, paymentMethod)
	return err
}

// PaymentStatusChange carries the pre-update snapshot returned by
// SetPaymentStatusGuarded, so a webhook can decide what side effects to fire
// based on values that are guaranteed to be atomic with the write.
type PaymentStatusChange struct {
	PrevStatus        string
	PrevPaymentStatus string
}

// ErrPaymentStatusUnchanged means the guard rejected the transition — the
// order is already in a stronger payment state (paid/refunded). Callers should
// treat it as a replay: acknowledge, fire no side effects.
var ErrPaymentStatusUnchanged = errors.New("payment status unchanged")

// SetPaymentStatusGuarded is the webhook-safe version of SetPaymentStatus: the
// guard, the write and the pre-update read all happen in one locking
// statement, so nothing can slip between them.
//
// Two classes of bug this closes:
//   - A retried 'pending' notification used to downgrade an already-settled
//     order; the next settlement then looked "fresh" and re-fired fulfillment
//     (duplicate tokens + emails).
//   - The expiry worker cancelling an order between the handler's snapshot read
//     and its write used to leave the handler on the normal-payment branch,
//     minting tokens for a cancelled order whose stock was already released.
//
// The FOR UPDATE sub-select re-checks its qual against the winning row version
// under concurrency, so the guard holds; the UPDATE then runs on the row we
// already hold the lock for.
func (r *OrderRepo) SetPaymentStatusGuarded(ctx context.Context, storeID, id uuid.UUID, paymentStatus, paymentMethod string) (*PaymentStatusChange, error) {
	// 'paid' may overwrite anything except another 'paid'. Weaker states
	// (pending/failed) may never overwrite a settled or refunded order.
	guard := "payment_status <> 'paid'"
	if paymentStatus != "paid" {
		guard = "payment_status NOT IN ('paid', 'refunded')"
	}
	q := `
		WITH locked AS (
		    SELECT id, status, payment_status
		    FROM orders
		    WHERE id = $1 AND store_id = $2 AND ` + guard + `
		    FOR UPDATE
		), upd AS (
		    UPDATE orders o
		    SET payment_status = $3,
		        payment_method = COALESCE(NULLIF($4, ''), o.payment_method),
		        paid_at = CASE WHEN $3 = 'paid' AND o.paid_at IS NULL THEN now() ELSE o.paid_at END,
		        updated_at = now()
		    FROM locked l
		    WHERE o.id = l.id
		    RETURNING l.status AS prev_status, l.payment_status AS prev_payment_status
		)
		SELECT prev_status, prev_payment_status FROM upd
	`
	var c PaymentStatusChange
	err := r.pool.QueryRow(ctx, q, id, storeID, paymentStatus, paymentMethod).
		Scan(&c.PrevStatus, &c.PrevPaymentStatus)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrPaymentStatusUnchanged
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

// FlagNeedsReview marks an order for seller attention — surfaced as a
// "Perlu dicek" badge + filter in Pesanan. Used e.g. when a payment lands on
// an already-cancelled order (late payment after auto-expiry).
func (r *OrderRepo) FlagNeedsReview(ctx context.Context, storeID, id uuid.UUID, reason string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE orders
		SET needs_review = true, review_reason = $3, updated_at = now()
		WHERE id = $1 AND store_id = $2
	`, id, storeID, reason)
	return err
}

// PrepareDigitalFulfillment fetches every digital line item for the
// order and reports whether the order is exclusively digital.
//
// When allDigital == true the order is also flipped to status='completed'
// (digital fulfillment needs no physical handling). When the cart is
// mixed (digital + physical), digital items are still returned so the
// caller can mint download tokens — physical fulfillment continues
// through the seller's manual workflow (BUG-022: previously the
// mixed-cart path returned nil and digital tokens were never minted).
func (r *OrderRepo) PrepareDigitalFulfillment(ctx context.Context, orderID uuid.UUID) (items []OrderItem, allDigital bool, err error) {
	var physicalCount int
	if err = r.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM order_items
		WHERE order_id = $1 AND product_type = 'physical'
	`, orderID).Scan(&physicalCount); err != nil {
		return nil, false, err
	}
	allDigital = physicalCount == 0

	if allDigital {
		if _, err = r.pool.Exec(ctx, `
			UPDATE orders
			SET status = 'completed',
			    completed_at = COALESCE(completed_at, now()),
			    updated_at = now()
			WHERE id = $1 AND status NOT IN ('completed', 'cancelled')
		`, orderID); err != nil {
			return nil, false, err
		}
	}

	// Non-physical items (digital + course) all need a delivery token minted;
	// the fulfiller branches on product_type for digital-link vs course-access
	// email copy.
	// LEFT JOIN products for the access-validity snapshot (course "masa aktif").
	// COALESCE guards deleted products → defaults to lifetime (no expiry).
	rows, err := r.pool.Query(ctx, `
		SELECT oi.id, oi.product_id, oi.product_name, oi.variant_name,
		       oi.unit_price_cents, oi.quantity, oi.subtotal_cents, oi.product_type,
		       COALESCE(p.access_validity_value, 0),
		       COALESCE(p.access_validity_unit, 'lifetime')
		FROM order_items oi
		LEFT JOIN products p ON p.id = oi.product_id
		WHERE oi.order_id = $1 AND oi.product_type IN ('digital', 'course')
	`, orderID)
	if err != nil {
		return nil, allDigital, err
	}
	defer rows.Close()
	for rows.Next() {
		var it OrderItem
		if err = rows.Scan(
			&it.ID, &it.ProductID, &it.ProductName, &it.VariantName,
			&it.UnitPriceCents, &it.Quantity, &it.SubtotalCents, &it.ProductType,
			&it.AccessValidityValue, &it.AccessValidityUnit,
		); err != nil {
			return nil, allDigital, err
		}
		items = append(items, it)
	}
	return items, allDigital, rows.Err()
}

// SetPaymentURL stores the Midtrans Snap redirect URL on the order.
func (r *OrderRepo) SetPaymentURL(ctx context.Context, storeID, id uuid.UUID, url string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE orders SET payment_url = $3, updated_at = now()
		WHERE id = $1 AND store_id = $2
	`, id, storeID, url)
	return err
}

// ErrMarkPaidNotAllowed means the order is in a state where a manual
// "tandai lunas" would corrupt it: already cancelled (stock/kuota already
// released — paying it would mint tokens against inventory that is gone) or
// already refunded (flipping back to paid would leave the refund fields set on
// a "paid" order).
var ErrMarkPaidNotAllowed = errors.New("mark paid not allowed")

// MarkPaid sets payment_status='paid', stamps paid_at. Used for manual
// confirmation. Mirrors the webhook's guards — a cancelled or refunded order
// is never silently flipped back to paid.
func (r *OrderRepo) MarkPaid(ctx context.Context, storeID, id uuid.UUID) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE orders SET payment_status = 'paid', paid_at = now(), updated_at = now()
		WHERE id = $1 AND store_id = $2
		  AND payment_status NOT IN ('paid', 'refunded')
		  AND status <> 'cancelled'
	`, id, storeID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		// Distinguish "nothing to do / illegal state" from "not yours".
		var status, paymentStatus string
		if qErr := r.pool.QueryRow(ctx,
			`SELECT status, payment_status FROM orders WHERE id = $1 AND store_id = $2`,
			id, storeID).Scan(&status, &paymentStatus); qErr == nil {
			if status == "cancelled" || paymentStatus == "refunded" {
				return ErrMarkPaidNotAllowed
			}
		}
		return ErrInvalidTransition
	}
	return nil
}

// SetSellerNotes overwrites the seller's internal notes for an order.
func (r *OrderRepo) SetSellerNotes(ctx context.Context, storeID, id uuid.UUID, notes string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE orders SET seller_notes = $3, updated_at = now()
		WHERE id = $1 AND store_id = $2
	`, id, storeID, notes)
	return err
}

// Create inserts an order + items + upserts customer in one transaction.
func (r *OrderRepo) Create(ctx context.Context, in CreateOrderInput) (*Order, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	// Subtotal
	var subtotal int64
	for _, it := range in.Items {
		subtotal += it.UnitCents * int64(it.Quantity)
	}
	// Clamp discount to subtotal so we never go negative.
	discount := in.DiscountCents
	if discount > subtotal {
		discount = subtotal
	}
	if discount < 0 {
		discount = 0
	}
	// Tax on the goods value (subtotal − discount). Exclusive tax is added on
	// top of the total; inclusive tax is informational (total unchanged).
	taxCents := ComputeTaxCents(subtotal-discount, in.TaxBps, in.TaxInclusive)
	total := subtotal + in.ShippingCents - discount
	if !in.TaxInclusive {
		total += taxCents
	}

	// Upsert customer (by store_id + whatsapp_number); atomic order/spend
	// increment. Anonymous orders (no WA — e.g. kiosk in-store self-order)
	// skip this entirely and store customer_id = NULL, so they don't all
	// collide into one junk shared customer row on (store_id, "").
	var customerID *uuid.UUID
	if in.CustomerWA != "" {
		var cid uuid.UUID
		if err := tx.QueryRow(ctx, `
			INSERT INTO customers (store_id, name, whatsapp_number, email, address, city,
			                       total_orders, total_spent_cents, last_order_at)
			VALUES ($1, $2, $3, $4, $5, $6, 1, $7, now())
			ON CONFLICT (store_id, whatsapp_number) DO UPDATE SET
			    -- Checkout is unauthenticated: anyone who knows a buyer's WA
			    -- number could otherwise rewrite that customer's name and
			    -- address in the seller's CRM with a single anonymous POST.
			    -- Only fill fields we don't already know.
			    name = COALESCE(NULLIF(customers.name, ''), NULLIF(EXCLUDED.name, ''), customers.name),
			    -- keep a previously-known email if this order didn't supply one
			    email = COALESCE(NULLIF(EXCLUDED.email, ''), customers.email),
			    address = COALESCE(NULLIF(EXCLUDED.address, ''), customers.address),
			    city = COALESCE(NULLIF(EXCLUDED.city, ''), customers.city),
			    total_orders = customers.total_orders + 1,
			    total_spent_cents = customers.total_spent_cents + EXCLUDED.total_spent_cents,
			    last_order_at = now(),
			    updated_at = now()
			RETURNING id
		`, in.StoreID, in.CustomerName, in.CustomerWA, in.CustomerEmail, in.CustomerAddress, in.CustomerCity, total).Scan(&cid); err != nil {
			return nil, fmt.Errorf("upsert customer: %w", err)
		}
		customerID = &cid
	}

	// Idempotency: a retried submit (kiosk "coba lagi", a flaky mobile
	// connection) must return the original order rather than creating a second
	// one. Stored as NULL when empty so the partial unique index from
	// migration 0090 ignores rows that don't use it.
	var idemKey *string
	if k := strings.TrimSpace(in.IdempotencyKey); k != "" {
		idemKey = &k
	}

	// Generate human-friendly order number: SO-YYYYMMDD-XXXX (4-char random)
	orderNum := generateOrderNumber()

	// Dine-in kitchen routing: when the order should enter the kitchen now,
	// allocate today's (WIB) queue number atomically.
	var queueNum *int
	var queueDate *string
	var kitchenStatus *string
	if in.KitchenStatus == "queued" {
		qd := time.Now().In(time.FixedZone("WIB", 7*3600)).Format("2006-01-02")
		n, qerr := allocQueueNumberTx(ctx, tx, in.StoreID, qd)
		if qerr != nil {
			return nil, fmt.Errorf("alloc queue: %w", qerr)
		}
		queueNum = &n
		queueDate = &qd
		ks := "queued"
		kitchenStatus = &ks
	}
	servingType := in.ServingType
	if servingType != "dine_in" && servingType != "takeaway" {
		servingType = ""
	}

	customFields := in.CustomFields
	if len(customFields) == 0 {
		customFields = []byte("[]")
	}

	source := in.Source
	if source == "" {
		source = "storefront"
	}

	var o Order
	if err := tx.QueryRow(ctx, `
		INSERT INTO orders (store_id, customer_id, order_number, status, payment_status,
		                   payment_method, subtotal_cents, shipping_cents, discount_cents,
		                   promo_code, promo_id, total_cents,
		                   courier, customer_name, customer_whatsapp, customer_email,
		                   customer_address, customer_city,
		                   notes, table_id, serving_type, kitchen_status, queue_number, queue_date,
		                   custom_fields, source, tax_cents, tax_bps, tax_inclusive,
		                   idempotency_key)
		VALUES ($1, $2, $3, 'pending', 'unpaid', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
		        $18, $19, $20, $21, $22::date, $23::jsonb, $24, $25, $26, $27, $28)
		RETURNING id, store_id, order_number, status, payment_status, payment_method,
		          subtotal_cents, shipping_cents, discount_cents, promo_code, total_cents, courier,
		          customer_name, customer_whatsapp, customer_email, customer_city, created_at,
		          queue_number, kitchen_status, serving_type, tax_cents, tax_bps, tax_inclusive
	`,
		in.StoreID, customerID, orderNum,
		in.PaymentMethod, subtotal, in.ShippingCents, discount,
		in.PromoCode, in.PromoID, total,
		in.Courier, in.CustomerName, in.CustomerWA, in.CustomerEmail,
		in.CustomerAddress, in.CustomerCity, in.Notes,
		in.TableID, servingType, kitchenStatus, queueNum, queueDate,
		string(customFields), source, taxCents, in.TaxBps, in.TaxInclusive,
		idemKey,
	).Scan(
		&o.ID, &o.StoreID, &o.OrderNumber, &o.Status, &o.PaymentStatus, &o.PaymentMethod,
		&o.SubtotalCents, &o.ShippingCents, &o.DiscountCents, &o.PromoCode, &o.TotalCents, &o.Courier,
		&o.CustomerName, &o.CustomerWhatsApp, &o.CustomerEmail, &o.CustomerCity, &o.CreatedAt,
		&o.QueueNumber, &o.KitchenStatus, &o.ServingType, &o.TaxCents, &o.TaxBps, &o.TaxInclusive,
	); err != nil {
		return nil, fmt.Errorf("insert order: %w", err)
	}

	for _, it := range in.Items {
		// Stock decrement only applies to physical items. Non-physical
		// (digital + course) have unlimited stock semantics — they don't
		// deplete on order.
		nonPhysical := it.ProductType != "physical"
		if !nonPhysical {
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
				`, it.ProductID, it.Quantity)
				if err != nil {
					return nil, fmt.Errorf("decrement product stock: %w", err)
				}
				rowsAffected = tag.RowsAffected()
			}
			if rowsAffected == 0 {
				return nil, ErrStockInsufficient
			}
		} else if it.DigitalStockLimit != nil {
			// Non-physical product with a seller-set sales cap (kuota): atomically
			// decrement the remaining quota. 0 rows = sold out (oversell-safe even
			// under concurrent orders). nil limit = unlimited → no decrement.
			tag, err := tx.Exec(ctx, `
				UPDATE products
				SET digital_stock_limit = digital_stock_limit - $2, updated_at = now()
				WHERE id = $1 AND digital_stock_limit >= $2
			`, it.ProductID, it.Quantity)
			if err != nil {
				return nil, fmt.Errorf("decrement digital limit: %w", err)
			}
			if tag.RowsAffected() == 0 {
				return nil, ErrStockInsufficient
			}
		}

		productType := normalizeProductType(it.ProductType)
		var orderItemID uuid.UUID
		if err := tx.QueryRow(ctx, `
			INSERT INTO order_items (order_id, product_id, variant_id, product_name, variant_name,
			                         unit_price_cents, quantity, subtotal_cents, product_type)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			RETURNING id
		`,
			o.ID, it.ProductID, it.VariantID, it.ProductName, it.VariantName,
			it.UnitCents, it.Quantity, it.UnitCents*int64(it.Quantity), productType,
		).Scan(&orderItemID); err != nil {
			return nil, fmt.Errorf("insert order_item: %w", err)
		}

		if err := insertOrderItemModifiersTx(ctx, tx, orderItemID, it.Modifiers); err != nil {
			return nil, fmt.Errorf("insert order_item_modifiers: %w", err)
		}

		// Record raw-material consumption (base recipe + selected option
		// recipes, × qty). Soft: a config gap / shortage never blocks the order.
		consume, err := resolveConsumptionTx(ctx, tx, it.ProductID, optionIDsFromSnaps(it.Modifiers), it.Quantity)
		if err != nil {
			return nil, fmt.Errorf("resolve consumption: %w", err)
		}
		if err := applyConsumptionTx(ctx, tx, in.StoreID, o.ID, orderItemID, consume); err != nil {
			return nil, fmt.Errorf("apply consumption: %w", err)
		}
	}

	// Claim the promo redemption inside the same transaction. This used to be
	// a read-then-write: CheckActive compared a stale used_count before the
	// order was created, and IncrementUsage ran unconditionally AFTER commit —
	// so a max_usage=1 flash sale handed the discount to every buyer who
	// submitted in the same second, and a failed increment left the promo
	// looking unused.
	if in.PromoID != nil {
		var claimed bool
		err := tx.QueryRow(ctx, `
			UPDATE promos
			SET used_count = used_count + 1, updated_at = now()
			WHERE id = $1 AND store_id = $2 AND is_active
			  AND (max_usage = 0 OR used_count < max_usage)
			  AND (starts_at   IS NULL OR starts_at   <= now())
			  AND (expires_at  IS NULL OR expires_at  >= now())
			RETURNING true
		`, *in.PromoID, in.StoreID).Scan(&claimed)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrPromoExhausted
		}
		if err != nil {
			return nil, fmt.Errorf("claim promo: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &o, nil
}

// FindByIdempotencyKey returns a previously-created order for this key, or
// ErrOrderNotFound. Used by the storefront create path so a retried submit
// answers with the original order instead of a duplicate.
func (r *OrderRepo) FindByIdempotencyKey(ctx context.Context, storeID uuid.UUID, key string) (*Order, error) {
	if strings.TrimSpace(key) == "" {
		return nil, ErrOrderNotFound
	}
	var number string
	err := r.pool.QueryRow(ctx,
		`SELECT order_number FROM orders WHERE store_id = $1 AND idempotency_key = $2`,
		storeID, key).Scan(&number)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrOrderNotFound
	}
	if err != nil {
		return nil, err
	}
	return r.FindByOrderNumber(ctx, storeID, number)
}

// ErrPromoExhausted means the promo ran out (or expired) between the buyer
// seeing it as valid and the order being written.
var ErrPromoExhausted = errors.New("kuota kode promo sudah habis")

// ErrStockInsufficient is returned by Create when a concurrent order or
// stock change has just made one of the requested items unavailable.
var ErrStockInsufficient = errors.New("stok tidak cukup")

// CountThisMonth returns the number of orders this calendar month for the
// given store, used by the seller dashboard to display "X / Y pesanan"
// usage. Cancelled orders are included so the meter matches what the
// quota enforcer (HasOrdersThisMonthAtLeast) sees.
//
// Hot-path quota checks must use HasOrdersThisMonthAtLeast instead — its
// cost is bounded by the limit, not by the number of orders the store
// has placed.
func (r *OrderRepo) CountThisMonth(ctx context.Context, storeID uuid.UUID) (int, error) {
	var n int
	err := r.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM orders
		WHERE store_id = $1 AND created_at >= date_trunc('month', now())
	`, storeID).Scan(&n)
	return n, err
}

// HasOrdersThisMonthAtLeast returns true if the store has at least n
// orders in the current calendar month. Bounded probe: stops scanning
// at row n+1, so the check stays cheap even when a hot store places
// thousands of orders per month.
func (r *OrderRepo) HasOrdersThisMonthAtLeast(ctx context.Context, storeID uuid.UUID, n int) (bool, error) {
	if n <= 0 {
		return true, nil
	}
	var x int
	// Cancelled orders must not consume the monthly quota: they include
	// auto-expired unpaid checkouts, so counting them let anyone shut a Free
	// store's storefront for the rest of the month with a handful of
	// abandoned carts. Month boundary is WIB, matching the seller's calendar.
	err := r.pool.QueryRow(ctx, `
		SELECT 1 FROM orders
		WHERE store_id = $1
		  AND created_at >= (date_trunc('month', now() AT TIME ZONE 'Asia/Jakarta')
		                     AT TIME ZONE 'Asia/Jakarta')
		  AND status <> 'cancelled'
		OFFSET $2 LIMIT 1
	`, storeID, n-1).Scan(&x)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	return err == nil, err
}

// generateOrderNumber builds SO-YYYYMMDD-XXXXXXXX.
//
// The suffix used to be 4 hex chars (65k values per store per day), which was
// short enough to (a) collide in normal traffic — a store doing ~300 orders a
// day had a coin-flip chance of a duplicate-key 500 at checkout every day —
// and (b) enumerate: the buyer-facing order endpoints are public and keyed
// only by {slug}/{number}, so a sweep of that space dumped every order's name,
// WhatsApp number and address. 8 chars of crypto/rand base32 (~1e12) closes
// both. Ambiguous characters are excluded so the number stays readable when a
// buyer reads it back over the phone.
const orderNumberAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

func generateOrderNumber() string {
	now := time.Now().In(time.FixedZone("WIB", 7*3600))
	b := make([]byte, 8)
	if _, err := cryptorand.Read(b); err != nil {
		// crypto/rand failing is fatal for uniqueness; fall back to UUID
		// entropy rather than emitting a predictable number.
		return fmt.Sprintf("SO-%s-%s", now.Format("20060102"),
			strings.ToUpper(strings.ReplaceAll(uuid.New().String(), "-", ""))[:8])
	}
	for i := range b {
		b[i] = orderNumberAlphabet[int(b[i])%len(orderNumberAlphabet)]
	}
	return fmt.Sprintf("SO-%s-%s", now.Format("20060102"), string(b))
}
