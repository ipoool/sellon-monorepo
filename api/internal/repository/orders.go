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
	SubtotalCents      int64
	ShippingCents      int64
	TotalCents         int64
	Courier            string
	CourierService     string
	TrackingNumber     string
	CustomerName       string
	CustomerWhatsApp   string
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
	CreatedAt          time.Time
	UpdatedAt          time.Time
}

type OrderItem struct {
	ID             uuid.UUID
	ProductID      *uuid.UUID
	ProductName    string
	VariantName    string
	UnitPriceCents int64
	Quantity       int
	SubtotalCents  int64
}

type OrderItemInput struct {
	ProductID   uuid.UUID
	VariantID   *uuid.UUID
	ProductName string
	VariantName string
	UnitCents   int64
	Quantity    int
}

type CreateOrderInput struct {
	StoreID         uuid.UUID
	CustomerName    string
	CustomerWA      string
	CustomerAddress string
	CustomerCity    string
	Courier         string
	PaymentMethod   string
	Notes           string
	ShippingCents   int64
	Items           []OrderItemInput
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
}

func (r *OrderRepo) ListByStore(ctx context.Context, storeID uuid.UUID, limit int) ([]Order, error) {
	return r.List(ctx, ListOrdersFilter{StoreID: storeID, Limit: limit})
}

func (r *OrderRepo) List(ctx context.Context, f ListOrdersFilter) ([]Order, error) {
	if f.Limit <= 0 || f.Limit > 1000 {
		f.Limit = 50
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
	args = append(args, f.Limit)
	q := `
		SELECT id, store_id, order_number, status, payment_status, payment_method,
		       subtotal_cents, shipping_cents, total_cents, courier,
		       customer_name, customer_whatsapp, customer_city, created_at
		FROM orders
		WHERE ` + where + `
		ORDER BY created_at DESC
		LIMIT $` + itoa(len(args))

	rows, err := r.pool.Query(ctx, q, args...)
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
	err = r.pool.QueryRow(ctx, `
		SELECT
		    COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now())),
		    COALESCE(SUM(total_cents) FILTER (WHERE created_at >= date_trunc('month', now()) AND payment_status = 'paid'), 0)
		FROM orders WHERE store_id = $1
	`, storeID).Scan(&todayCount, &monthRevenueCents)
	return
}

var ErrOrderNotFound = errors.New("order not found")
var ErrInvalidTransition = errors.New("invalid status transition")

// FindByID returns full order with all fields. Tenant-isolated by storeID.
func (r *OrderRepo) FindByID(ctx context.Context, storeID, id uuid.UUID) (*Order, error) {
	const q = `
		SELECT id, store_id, order_number, status, payment_status, payment_method,
		       subtotal_cents, shipping_cents, total_cents,
		       courier, courier_service, tracking_number,
		       customer_name, customer_whatsapp, customer_address, customer_city,
		       notes, seller_notes, payment_url,
		       paid_at, shipped_at, completed_at, cancelled_at, cancellation_reason,
		       created_at, updated_at
		FROM orders WHERE id = $1 AND store_id = $2
	`
	var o Order
	err := r.pool.QueryRow(ctx, q, id, storeID).Scan(
		&o.ID, &o.StoreID, &o.OrderNumber, &o.Status, &o.PaymentStatus, &o.PaymentMethod,
		&o.SubtotalCents, &o.ShippingCents, &o.TotalCents,
		&o.Courier, &o.CourierService, &o.TrackingNumber,
		&o.CustomerName, &o.CustomerWhatsApp, &o.CustomerAddress, &o.CustomerCity,
		&o.Notes, &o.SellerNotes, &o.PaymentURL,
		&o.PaidAt, &o.ShippedAt, &o.CompletedAt, &o.CancelledAt, &o.CancellationReason,
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
		SELECT id, product_id, product_name, variant_name, unit_price_cents, quantity, subtotal_cents
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
			&it.UnitPriceCents, &it.Quantity, &it.SubtotalCents,
		); err != nil {
			return nil, err
		}
		out = append(out, it)
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
	tag, err := r.pool.Exec(ctx, `
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
	return nil
}

// FindByOrderNumber looks up an order by store + order_number (unique pair).
// Used by the webhook handler to map a Midtrans order_id back to our row.
func (r *OrderRepo) FindByOrderNumber(ctx context.Context, storeID uuid.UUID, orderNumber string) (*Order, error) {
	const q = `
		SELECT id, store_id, order_number, status, payment_status, payment_method,
		       subtotal_cents, shipping_cents, total_cents,
		       courier, courier_service, tracking_number,
		       customer_name, customer_whatsapp, customer_address, customer_city,
		       notes, seller_notes, payment_url,
		       paid_at, shipped_at, completed_at, cancelled_at, cancellation_reason,
		       created_at, updated_at
		FROM orders WHERE store_id = $1 AND order_number = $2
	`
	var o Order
	err := r.pool.QueryRow(ctx, q, storeID, orderNumber).Scan(
		&o.ID, &o.StoreID, &o.OrderNumber, &o.Status, &o.PaymentStatus, &o.PaymentMethod,
		&o.SubtotalCents, &o.ShippingCents, &o.TotalCents,
		&o.Courier, &o.CourierService, &o.TrackingNumber,
		&o.CustomerName, &o.CustomerWhatsApp, &o.CustomerAddress, &o.CustomerCity,
		&o.Notes, &o.SellerNotes, &o.PaymentURL,
		&o.PaidAt, &o.ShippedAt, &o.CompletedAt, &o.CancelledAt, &o.CancellationReason,
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
	total := subtotal + in.ShippingCents

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

	var o Order
	if err := tx.QueryRow(ctx, `
		INSERT INTO orders (store_id, customer_id, order_number, status, payment_status,
		                   payment_method, subtotal_cents, shipping_cents, total_cents,
		                   courier, customer_name, customer_whatsapp, customer_address, customer_city,
		                   notes)
		VALUES ($1, $2, $3, 'pending', 'unpaid', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
		RETURNING id, store_id, order_number, status, payment_status, payment_method,
		          subtotal_cents, shipping_cents, total_cents, courier,
		          customer_name, customer_whatsapp, customer_city, created_at
	`,
		in.StoreID, customerID, orderNum,
		in.PaymentMethod, subtotal, in.ShippingCents, total,
		in.Courier, in.CustomerName, in.CustomerWA, in.CustomerAddress, in.CustomerCity, in.Notes,
	).Scan(
		&o.ID, &o.StoreID, &o.OrderNumber, &o.Status, &o.PaymentStatus, &o.PaymentMethod,
		&o.SubtotalCents, &o.ShippingCents, &o.TotalCents, &o.Courier,
		&o.CustomerName, &o.CustomerWhatsApp, &o.CustomerCity, &o.CreatedAt,
	); err != nil {
		return nil, fmt.Errorf("insert order: %w", err)
	}

	for _, it := range in.Items {
		if _, err := tx.Exec(ctx, `
			INSERT INTO order_items (order_id, product_id, variant_id, product_name, variant_name,
			                         unit_price_cents, quantity, subtotal_cents)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		`,
			o.ID, it.ProductID, it.VariantID, it.ProductName, it.VariantName,
			it.UnitCents, it.Quantity, it.UnitCents*int64(it.Quantity),
		); err != nil {
			return nil, fmt.Errorf("insert order_item: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &o, nil
}

func generateOrderNumber() string {
	now := time.Now().UTC()
	rand4 := strings.ToUpper(uuid.New().String()[:4])
	return fmt.Sprintf("SO-%s-%s", now.Format("20060102"), rand4)
}
