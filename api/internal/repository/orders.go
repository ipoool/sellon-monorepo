package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

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
	// Dine-in / kitchen pipeline (NULL/empty for non-kitchen orders).
	QueueNumber   *int
	KitchenStatus *string
	ServingType   string
	CreatedAt             time.Time
	UpdatedAt             time.Time
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
}

type OrderItemInput struct {
	ProductID   uuid.UUID
	VariantID   *uuid.UUID
	ProductName string
	VariantName string
	UnitCents   int64
	Quantity    int
	ProductType string // "physical" | "digital" — when "digital", Create skips stock decrement
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
}

type OrderRepo struct {
	pool *pgxpool.Pool
}

func NewOrderRepo(pool *pgxpool.Pool) *OrderRepo {
	return &OrderRepo{pool: pool}
}

type ListOrdersFilter struct {
	StoreID       uuid.UUID
	Search        string // matches order_number or customer_name
	Status        string // "" = all
	PaymentStatus string // "" = all
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
	if f.Limit <= 0 || f.Limit > 1000 {
		f.Limit = 50
	}
	if f.Offset < 0 {
		f.Offset = 0
	}
	args := []any{f.StoreID}
	where := "store_id = $1"
	if f.Search != "" {
		args = append(args, "%"+f.Search+"%")
		where += " AND (order_number ILIKE $2 OR customer_name ILIKE $2)"
	}
	if f.Status != "" {
		args = append(args, f.Status)
		where += " AND status = $" + itoa(len(args))
	}
	if f.PaymentStatus != "" {
		args = append(args, f.PaymentStatus)
		where += " AND payment_status = $" + itoa(len(args))
	}

	var total int
	if err := r.pool.QueryRow(ctx,
		"SELECT COUNT(*) FROM orders WHERE "+where, args...,
	).Scan(&total); err != nil {
		return nil, 0, err
	}

	args = append(args, f.Limit, f.Offset)
	q := `
		SELECT id, store_id, order_number, status, payment_status, payment_method,
		       subtotal_cents, shipping_cents, total_cents, courier,
		       customer_name, customer_whatsapp, customer_city, created_at
		FROM orders
		WHERE ` + where + `
		ORDER BY created_at DESC
		LIMIT $` + itoa(len(args)-1) + ` OFFSET $` + itoa(len(args))

	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, 0, err
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
			return nil, 0, err
		}
		out = append(out, o)
	}
	return out, total, rows.Err()
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
func (r *OrderRepo) FindByID(ctx context.Context, storeID, id uuid.UUID) (*Order, error) {
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
		       created_at, updated_at
		FROM orders WHERE id = $1 AND store_id = $2
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
		WHERE id = $1 AND store_id = $2 AND status NOT IN ('completed', 'cancelled')
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
		    updated_at = now()
		WHERE id = $1 AND store_id = $2
		  AND payment_status = 'paid'
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
			UPDATE promos SET used_count = GREATEST(0, used_count - 1),
			                  updated_at = now()
			WHERE id = (
			    SELECT promo_id FROM orders
			    WHERE id = $1 AND promo_id IS NOT NULL
			)
		`, id); err != nil {
			return fmt.Errorf("decrement promo usage on refund: %w", err)
		}
	}

	return tx.Commit(ctx)
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

	rows, err := r.pool.Query(ctx, `
		SELECT id, product_id, product_name, variant_name,
		       unit_price_cents, quantity, subtotal_cents, product_type
		FROM order_items WHERE order_id = $1 AND product_type = 'digital'
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

// MarkPaid sets payment_status='paid', stamps paid_at. Used for manual confirmation.
func (r *OrderRepo) MarkPaid(ctx context.Context, storeID, id uuid.UUID) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE orders SET payment_status = 'paid', paid_at = now(), updated_at = now()
		WHERE id = $1 AND store_id = $2 AND payment_status != 'paid'
	`, id, storeID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
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
	total := subtotal + in.ShippingCents - discount

	// Upsert customer (by store_id + whatsapp_number); atomic order/spend increment.
	var customerID uuid.UUID
	if err := tx.QueryRow(ctx, `
		INSERT INTO customers (store_id, name, whatsapp_number, address, city,
		                       total_orders, total_spent_cents, last_order_at)
		VALUES ($1, $2, $3, $4, $5, 1, $6, now())
		ON CONFLICT (store_id, whatsapp_number) DO UPDATE SET
		    name = EXCLUDED.name,
		    address = EXCLUDED.address,
		    city = EXCLUDED.city,
		    total_orders = customers.total_orders + 1,
		    total_spent_cents = customers.total_spent_cents + EXCLUDED.total_spent_cents,
		    last_order_at = now(),
		    updated_at = now()
		RETURNING id
	`, in.StoreID, in.CustomerName, in.CustomerWA, in.CustomerAddress, in.CustomerCity, total).Scan(&customerID); err != nil {
		return nil, fmt.Errorf("upsert customer: %w", err)
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

	var o Order
	if err := tx.QueryRow(ctx, `
		INSERT INTO orders (store_id, customer_id, order_number, status, payment_status,
		                   payment_method, subtotal_cents, shipping_cents, discount_cents,
		                   promo_code, promo_id, total_cents,
		                   courier, customer_name, customer_whatsapp, customer_email,
		                   customer_address, customer_city,
		                   notes, table_id, serving_type, kitchen_status, queue_number, queue_date)
		VALUES ($1, $2, $3, 'pending', 'unpaid', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
		        $18, $19, $20, $21, $22::date)
		RETURNING id, store_id, order_number, status, payment_status, payment_method,
		          subtotal_cents, shipping_cents, discount_cents, promo_code, total_cents, courier,
		          customer_name, customer_whatsapp, customer_email, customer_city, created_at,
		          queue_number, kitchen_status, serving_type
	`,
		in.StoreID, customerID, orderNum,
		in.PaymentMethod, subtotal, in.ShippingCents, discount,
		in.PromoCode, in.PromoID, total,
		in.Courier, in.CustomerName, in.CustomerWA, in.CustomerEmail,
		in.CustomerAddress, in.CustomerCity, in.Notes,
		in.TableID, servingType, kitchenStatus, queueNum, queueDate,
	).Scan(
		&o.ID, &o.StoreID, &o.OrderNumber, &o.Status, &o.PaymentStatus, &o.PaymentMethod,
		&o.SubtotalCents, &o.ShippingCents, &o.DiscountCents, &o.PromoCode, &o.TotalCents, &o.Courier,
		&o.CustomerName, &o.CustomerWhatsApp, &o.CustomerEmail, &o.CustomerCity, &o.CreatedAt,
		&o.QueueNumber, &o.KitchenStatus, &o.ServingType,
	); err != nil {
		return nil, fmt.Errorf("insert order: %w", err)
	}

	for _, it := range in.Items {
		isDigital := it.ProductType == "digital"

		// Stock decrement only applies to physical items. Digital items
		// have unlimited stock semantics — they don't deplete on order.
		if !isDigital {
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
		}

		productType := it.ProductType
		if productType != "digital" {
			productType = "physical"
		}
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

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &o, nil
}

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
	err := r.pool.QueryRow(ctx, `
		SELECT 1 FROM orders
		WHERE store_id = $1 AND created_at >= date_trunc('month', now())
		OFFSET $2 LIMIT 1
	`, storeID, n-1).Scan(&x)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	return err == nil, err
}

func generateOrderNumber() string {
	now := time.Now().UTC()
	rand4 := strings.ToUpper(uuid.New().String()[:4])
	return fmt.Sprintf("SO-%s-%s", now.Format("20060102"), rand4)
}
