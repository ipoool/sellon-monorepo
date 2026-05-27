package repository

import (
	"context"
	"crypto/rand"
	"errors"
	"math/big"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ─── Errors ──────────────────────────────────────────────────────────────────

var (
	ErrResellerProgramNotFound    = errors.New("program reseller tidak ditemukan")
	ErrResellerMembershipNotFound = errors.New("keanggotaan reseller tidak ditemukan")
	ErrResellerCatalogNotFound    = errors.New("item katalog tidak ditemukan")
	ErrAlreadyMember              = errors.New("toko kamu sudah tergabung dalam program ini")
	ErrPriceBelowModal            = errors.New("harga jual tidak boleh lebih rendah dari harga modal")
)

// ─── Domain types ─────────────────────────────────────────────────────────────

type ResellerProgram struct {
	ID               uuid.UUID
	SupplierStoreID  uuid.UUID
	Name             string
	Description      string
	InviteCode       string
	IsActive         bool
	CreatedAt        time.Time
	UpdatedAt        time.Time

	// Populated by joined queries.
	SupplierStoreName string
	MemberCount       int
	ProductCount      int
}

type ResellerMembership struct {
	ID               uuid.UUID
	ProgramID        uuid.UUID
	ResellerStoreID  uuid.UUID
	IsActive         bool
	JoinedAt         time.Time

	// Joined.
	ProgramName       string
	SupplierStoreName string
	SupplierStoreID   uuid.UUID
	ProductCount      int
}

type ProgramProduct struct {
	ID                  uuid.UUID
	ProgramID           uuid.UUID
	ProductID           uuid.UUID
	ResellerPriceCents  int64
	IsActive            bool
	CreatedAt           time.Time
	UpdatedAt           time.Time

	// Joined from products.
	ProductName   string
	ProductSlug   string
	PhotoURLs     []string
	Stock         int
	ProductStatus string
}

type ProgramProductInput struct {
	ProductID           uuid.UUID
	ResellerPriceCents  int64
	IsActive            bool
}

type ResellerCatalogEntry struct {
	ID                  uuid.UUID
	MembershipID        uuid.UUID
	ProgramProductID    uuid.UUID
	ResellerPriceCents  int64
	IsActive            bool
	CreatedAt           time.Time
	UpdatedAt           time.Time

	// Joined.
	ProductID          uuid.UUID
	ProductName        string
	ProductSlug        string
	PhotoURLs          []string
	Stock              int
	ModalCents         int64 // reseller_program_products.reseller_price_cents
	SupplierStoreID    uuid.UUID
	SupplierStoreName  string
}

// DropshipProduct is returned by ListActiveDropshipProducts for use by the
// storefront handler when building the product list for a reseller's store.
type DropshipProduct struct {
	CatalogID          uuid.UUID
	ProductID          uuid.UUID
	SupplierStoreID    uuid.UUID
	Name               string
	Slug               string
	Description        string
	PriceCents         int64 // reseller's sell price (reseller_catalog.reseller_price_cents)
	ModalCents         int64
	Stock              int
	PhotoURLs          []string
	WeightG            int
	LengthCm           int
	WidthCm            int
	HeightCm           int
	ProductType        string
}

type DropshipOrderItem struct {
	OrderItemID        uuid.UUID
	OrderID            uuid.UUID
	OrderNumber        string
	OrderCreatedAt     time.Time
	ProductName        string
	VariantName        string
	Quantity           int
	UnitPriceCents     int64 // reseller sold to buyer
	ResellerCostCents  int64 // reseller owes supplier
	SubtotalCents      int64
	// Buyer info — shown to supplier for blind dropship.
	CustomerName       string
	CustomerWA         string
	CustomerAddress    string
	CustomerCity       string
	// Tracking.
	TrackingNumber     string
	ShippedAt          *time.Time
	// Context.
	ResellerStoreName  string
	CatalogID          uuid.UUID
	SupplierStoreID    uuid.UUID
}

// ─── Repo ─────────────────────────────────────────────────────────────────────

type ResellerRepo struct {
	pool *pgxpool.Pool
}

func NewResellerRepo(pool *pgxpool.Pool) *ResellerRepo {
	return &ResellerRepo{pool: pool}
}

// ─── Supplier: programs ───────────────────────────────────────────────────────

func (r *ResellerRepo) CreateProgram(ctx context.Context, supplierStoreID uuid.UUID, name, description string) (*ResellerProgram, error) {
	code, err := generateInviteCode(ctx, r.pool)
	if err != nil {
		return nil, err
	}
	var p ResellerProgram
	err = r.pool.QueryRow(ctx, `
		INSERT INTO reseller_programs (supplier_store_id, name, description, invite_code)
		VALUES ($1, $2, $3, $4)
		RETURNING id, supplier_store_id, name, description, invite_code, is_active, created_at, updated_at
	`, supplierStoreID, strings.TrimSpace(name), strings.TrimSpace(description), code).
		Scan(&p.ID, &p.SupplierStoreID, &p.Name, &p.Description,
			&p.InviteCode, &p.IsActive, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *ResellerRepo) ListProgramsBySupplier(ctx context.Context, supplierStoreID uuid.UUID) ([]ResellerProgram, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT rp.id, rp.supplier_store_id, rp.name, rp.description, rp.invite_code,
		       rp.is_active, rp.created_at, rp.updated_at,
		       COALESCE(s.name, '') AS supplier_store_name,
		       COUNT(DISTINCT rm.id) FILTER (WHERE rm.is_active) AS member_count,
		       COUNT(DISTINCT pp.id) FILTER (WHERE pp.is_active) AS product_count
		FROM reseller_programs rp
		LEFT JOIN stores s ON s.id = rp.supplier_store_id
		LEFT JOIN reseller_memberships rm ON rm.program_id = rp.id
		LEFT JOIN reseller_program_products pp ON pp.program_id = rp.id
		WHERE rp.supplier_store_id = $1
		GROUP BY rp.id, s.name
		ORDER BY rp.created_at DESC
	`, supplierStoreID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ResellerProgram
	for rows.Next() {
		var p ResellerProgram
		if err := rows.Scan(
			&p.ID, &p.SupplierStoreID, &p.Name, &p.Description, &p.InviteCode,
			&p.IsActive, &p.CreatedAt, &p.UpdatedAt,
			&p.SupplierStoreName, &p.MemberCount, &p.ProductCount,
		); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (r *ResellerRepo) GetProgramByID(ctx context.Context, programID, supplierStoreID uuid.UUID) (*ResellerProgram, error) {
	var p ResellerProgram
	err := r.pool.QueryRow(ctx, `
		SELECT rp.id, rp.supplier_store_id, rp.name, rp.description, rp.invite_code,
		       rp.is_active, rp.created_at, rp.updated_at,
		       COALESCE(s.name, '') AS supplier_store_name,
		       COUNT(DISTINCT rm.id) FILTER (WHERE rm.is_active) AS member_count,
		       COUNT(DISTINCT pp.id) FILTER (WHERE pp.is_active) AS product_count
		FROM reseller_programs rp
		LEFT JOIN stores s ON s.id = rp.supplier_store_id
		LEFT JOIN reseller_memberships rm ON rm.program_id = rp.id
		LEFT JOIN reseller_program_products pp ON pp.program_id = rp.id
		WHERE rp.id = $1 AND rp.supplier_store_id = $2
		GROUP BY rp.id, s.name
	`, programID, supplierStoreID).Scan(
		&p.ID, &p.SupplierStoreID, &p.Name, &p.Description, &p.InviteCode,
		&p.IsActive, &p.CreatedAt, &p.UpdatedAt,
		&p.SupplierStoreName, &p.MemberCount, &p.ProductCount,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrResellerProgramNotFound
	}
	return &p, err
}

func (r *ResellerRepo) GetProgramByInviteCode(ctx context.Context, code string) (*ResellerProgram, error) {
	var p ResellerProgram
	err := r.pool.QueryRow(ctx, `
		SELECT rp.id, rp.supplier_store_id, rp.name, rp.description, rp.invite_code,
		       rp.is_active, rp.created_at, rp.updated_at,
		       COALESCE(s.name, '') AS supplier_store_name,
		       COUNT(DISTINCT rm.id) FILTER (WHERE rm.is_active) AS member_count,
		       COUNT(DISTINCT pp.id) FILTER (WHERE pp.is_active) AS product_count
		FROM reseller_programs rp
		LEFT JOIN stores s ON s.id = rp.supplier_store_id
		LEFT JOIN reseller_memberships rm ON rm.program_id = rp.id
		LEFT JOIN reseller_program_products pp ON pp.program_id = rp.id
		WHERE UPPER(rp.invite_code) = UPPER($1) AND rp.is_active = true
		GROUP BY rp.id, s.name
	`, strings.TrimSpace(code)).Scan(
		&p.ID, &p.SupplierStoreID, &p.Name, &p.Description, &p.InviteCode,
		&p.IsActive, &p.CreatedAt, &p.UpdatedAt,
		&p.SupplierStoreName, &p.MemberCount, &p.ProductCount,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrResellerProgramNotFound
	}
	return &p, err
}

func (r *ResellerRepo) UpdateProgram(ctx context.Context, programID, supplierStoreID uuid.UUID, name, description string, isActive bool) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE reseller_programs
		SET name = $3, description = $4, is_active = $5, updated_at = now()
		WHERE id = $1 AND supplier_store_id = $2
	`, programID, supplierStoreID, strings.TrimSpace(name), strings.TrimSpace(description), isActive)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrResellerProgramNotFound
	}
	return nil
}

func (r *ResellerRepo) RegenerateInviteCode(ctx context.Context, programID, supplierStoreID uuid.UUID) (string, error) {
	code, err := generateInviteCode(ctx, r.pool)
	if err != nil {
		return "", err
	}
	tag, err := r.pool.Exec(ctx, `
		UPDATE reseller_programs SET invite_code = $3, updated_at = now()
		WHERE id = $1 AND supplier_store_id = $2
	`, programID, supplierStoreID, code)
	if err != nil {
		return "", err
	}
	if tag.RowsAffected() == 0 {
		return "", ErrResellerProgramNotFound
	}
	return code, nil
}

// ─── Supplier: program products ───────────────────────────────────────────────

// SetProgramProducts replaces the product list for a program using upsert.
func (r *ResellerRepo) SetProgramProducts(ctx context.Context, programID uuid.UUID, inputs []ProgramProductInput) error {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Mark all existing entries inactive; we re-activate only the ones in the new list.
	if _, err := tx.Exec(ctx,
		`UPDATE reseller_program_products SET is_active = false, updated_at = now() WHERE program_id = $1`,
		programID,
	); err != nil {
		return err
	}

	for _, in := range inputs {
		if _, err := tx.Exec(ctx, `
			INSERT INTO reseller_program_products (program_id, product_id, reseller_price_cents, is_active)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (program_id, product_id) DO UPDATE
			SET reseller_price_cents = EXCLUDED.reseller_price_cents,
			    is_active = EXCLUDED.is_active,
			    updated_at = now()
		`, programID, in.ProductID, in.ResellerPriceCents, in.IsActive); err != nil {
			return err
		}
	}

	// When a program product becomes inactive, deactivate matching catalog entries.
	if _, err := tx.Exec(ctx, `
		UPDATE reseller_catalog rc
		SET is_active = false, updated_at = now()
		FROM reseller_program_products pp
		WHERE rc.program_product_id = pp.id
		  AND pp.program_id = $1
		  AND pp.is_active = false
	`, programID); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func (r *ResellerRepo) ListProgramProducts(ctx context.Context, programID uuid.UUID) ([]ProgramProduct, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT pp.id, pp.program_id, pp.product_id, pp.reseller_price_cents,
		       pp.is_active, pp.created_at, pp.updated_at,
		       COALESCE(p.name, ''), COALESCE(p.slug, ''),
		       COALESCE(p.photo_urls, ARRAY[]::text[]),
		       COALESCE(p.stock, 0), COALESCE(p.status, '')
		FROM reseller_program_products pp
		LEFT JOIN products p ON p.id = pp.product_id
		WHERE pp.program_id = $1
		ORDER BY pp.created_at ASC
	`, programID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ProgramProduct
	for rows.Next() {
		var pp ProgramProduct
		if err := rows.Scan(
			&pp.ID, &pp.ProgramID, &pp.ProductID, &pp.ResellerPriceCents,
			&pp.IsActive, &pp.CreatedAt, &pp.UpdatedAt,
			&pp.ProductName, &pp.ProductSlug, &pp.PhotoURLs, &pp.Stock, &pp.ProductStatus,
		); err != nil {
			return nil, err
		}
		out = append(out, pp)
	}
	return out, rows.Err()
}

func (r *ResellerRepo) ListProgramMembers(ctx context.Context, programID uuid.UUID) ([]ResellerMembership, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT rm.id, rm.program_id, rm.reseller_store_id, rm.is_active, rm.joined_at,
		       COALESCE(s.name, '')
		FROM reseller_memberships rm
		LEFT JOIN stores s ON s.id = rm.reseller_store_id
		WHERE rm.program_id = $1
		ORDER BY rm.joined_at DESC
	`, programID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ResellerMembership
	for rows.Next() {
		var m ResellerMembership
		if err := rows.Scan(
			&m.ID, &m.ProgramID, &m.ResellerStoreID, &m.IsActive, &m.JoinedAt,
			&m.SupplierStoreName,
		); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// ─── Supplier: fulfill dropship orders ───────────────────────────────────────

func (r *ResellerRepo) ListSupplierDropshipOrders(ctx context.Context, supplierStoreID uuid.UUID) ([]DropshipOrderItem, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT oi.id, oi.order_id, o.order_number, o.created_at,
		       oi.product_name, oi.variant_name, oi.quantity,
		       oi.unit_price_cents, oi.reseller_cost_cents, oi.subtotal_cents,
		       o.customer_name, o.customer_whatsapp, o.customer_address, o.customer_city,
		       COALESCE(o.tracking_number, ''),
		       o.shipped_at,
		       COALESCE(rs.name, ''),
		       oi.reseller_catalog_id, oi.supplier_store_id
		FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		JOIN stores rs ON rs.id = o.store_id
		WHERE oi.supplier_store_id = $1
		  AND o.status NOT IN ('cancelled')
		ORDER BY o.created_at DESC
	`, supplierStoreID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []DropshipOrderItem
	for rows.Next() {
		var d DropshipOrderItem
		if err := rows.Scan(
			&d.OrderItemID, &d.OrderID, &d.OrderNumber, &d.OrderCreatedAt,
			&d.ProductName, &d.VariantName, &d.Quantity,
			&d.UnitPriceCents, &d.ResellerCostCents, &d.SubtotalCents,
			&d.CustomerName, &d.CustomerWA, &d.CustomerAddress, &d.CustomerCity,
			&d.TrackingNumber, &d.ShippedAt,
			&d.ResellerStoreName,
			&d.CatalogID, &d.SupplierStoreID,
		); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// MarkDropshipShipped records the tracking number and updates the order's
// tracking_number + shipped_at if all items have now been shipped.
func (r *ResellerRepo) MarkDropshipShipped(ctx context.Context, orderItemID, supplierStoreID uuid.UUID, trackingNumber string) error {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Verify item belongs to this supplier.
	var orderID uuid.UUID
	err = tx.QueryRow(ctx,
		`SELECT order_id FROM order_items WHERE id = $1 AND supplier_store_id = $2`,
		orderItemID, supplierStoreID,
	).Scan(&orderID)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrResellerCatalogNotFound
	}
	if err != nil {
		return err
	}

	// Forward the resi to the parent order.
	if _, err := tx.Exec(ctx, `
		UPDATE orders
		SET tracking_number = $2,
		    shipped_at = COALESCE(shipped_at, now()),
		    status = CASE WHEN status = 'processing' THEN 'shipped' ELSE status END,
		    updated_at = now()
		WHERE id = $1
	`, orderID, strings.TrimSpace(trackingNumber)); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// ─── Reseller: join & memberships ────────────────────────────────────────────

func (r *ResellerRepo) JoinProgram(ctx context.Context, resellerStoreID uuid.UUID, inviteCode string) (*ResellerMembership, error) {
	prog, err := r.GetProgramByInviteCode(ctx, inviteCode)
	if err != nil {
		return nil, err
	}

	// Guard: reseller cannot join their own supplier program.
	if prog.SupplierStoreID == resellerStoreID {
		return nil, errors.New("tidak bisa bergabung ke program milik toko sendiri")
	}

	var m ResellerMembership
	err = r.pool.QueryRow(ctx, `
		INSERT INTO reseller_memberships (program_id, reseller_store_id)
		VALUES ($1, $2)
		ON CONFLICT (program_id, reseller_store_id) DO UPDATE
		  SET is_active = true
		RETURNING id, program_id, reseller_store_id, is_active, joined_at
	`, prog.ID, resellerStoreID).Scan(
		&m.ID, &m.ProgramID, &m.ResellerStoreID, &m.IsActive, &m.JoinedAt,
	)
	if err != nil {
		return nil, err
	}
	m.ProgramName = prog.Name
	m.SupplierStoreName = prog.SupplierStoreName
	m.SupplierStoreID = prog.SupplierStoreID
	return &m, nil
}

func (r *ResellerRepo) ListMemberships(ctx context.Context, resellerStoreID uuid.UUID) ([]ResellerMembership, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT rm.id, rm.program_id, rm.reseller_store_id, rm.is_active, rm.joined_at,
		       rp.name, rp.supplier_store_id,
		       COALESCE(s.name, ''),
		       COUNT(pp.id) FILTER (WHERE pp.is_active) AS product_count
		FROM reseller_memberships rm
		JOIN reseller_programs rp ON rp.id = rm.program_id
		LEFT JOIN stores s ON s.id = rp.supplier_store_id
		LEFT JOIN reseller_program_products pp ON pp.program_id = rp.id
		WHERE rm.reseller_store_id = $1 AND rm.is_active = true
		GROUP BY rm.id, rp.id, rp.name, rp.supplier_store_id, s.name
		ORDER BY rm.joined_at DESC
	`, resellerStoreID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ResellerMembership
	for rows.Next() {
		var m ResellerMembership
		if err := rows.Scan(
			&m.ID, &m.ProgramID, &m.ResellerStoreID, &m.IsActive, &m.JoinedAt,
			&m.ProgramName, &m.SupplierStoreID, &m.SupplierStoreName, &m.ProductCount,
		); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// ─── Reseller: available products from supplier ───────────────────────────────

func (r *ResellerRepo) ListAvailableProducts(ctx context.Context, membershipID uuid.UUID) ([]ProgramProduct, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT pp.id, pp.program_id, pp.product_id, pp.reseller_price_cents,
		       pp.is_active, pp.created_at, pp.updated_at,
		       COALESCE(p.name, ''), COALESCE(p.slug, ''),
		       COALESCE(p.photo_urls, ARRAY[]::text[]),
		       COALESCE(p.stock, 0), COALESCE(p.status, '')
		FROM reseller_program_products pp
		JOIN reseller_memberships rm ON rm.program_id = pp.program_id
		LEFT JOIN products p ON p.id = pp.product_id
		WHERE rm.id = $1
		  AND rm.is_active = true
		  AND pp.is_active = true
		  AND p.status = 'active'
		ORDER BY pp.created_at ASC
	`, membershipID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ProgramProduct
	for rows.Next() {
		var pp ProgramProduct
		if err := rows.Scan(
			&pp.ID, &pp.ProgramID, &pp.ProductID, &pp.ResellerPriceCents,
			&pp.IsActive, &pp.CreatedAt, &pp.UpdatedAt,
			&pp.ProductName, &pp.ProductSlug, &pp.PhotoURLs, &pp.Stock, &pp.ProductStatus,
		); err != nil {
			return nil, err
		}
		out = append(out, pp)
	}
	return out, rows.Err()
}

// ─── Reseller: catalog (imported products) ────────────────────────────────────

func (r *ResellerRepo) ImportProduct(ctx context.Context, membershipID, programProductID uuid.UUID, sellPriceCents int64) (*ResellerCatalogEntry, error) {
	// Fetch modal price to validate.
	var modal int64
	err := r.pool.QueryRow(ctx,
		`SELECT reseller_price_cents FROM reseller_program_products WHERE id = $1 AND is_active = true`,
		programProductID,
	).Scan(&modal)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrResellerProgramNotFound
	}
	if err != nil {
		return nil, err
	}
	if sellPriceCents < modal {
		return nil, ErrPriceBelowModal
	}

	var entry ResellerCatalogEntry
	err = r.pool.QueryRow(ctx, `
		INSERT INTO reseller_catalog (membership_id, program_product_id, reseller_price_cents)
		VALUES ($1, $2, $3)
		ON CONFLICT (membership_id, program_product_id) DO UPDATE
		SET reseller_price_cents = EXCLUDED.reseller_price_cents,
		    is_active = true,
		    updated_at = now()
		RETURNING id, membership_id, program_product_id, reseller_price_cents, is_active, created_at, updated_at
	`, membershipID, programProductID, sellPriceCents).Scan(
		&entry.ID, &entry.MembershipID, &entry.ProgramProductID, &entry.ResellerPriceCents,
		&entry.IsActive, &entry.CreatedAt, &entry.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	entry.ModalCents = modal
	return &entry, nil
}

func (r *ResellerRepo) ListCatalog(ctx context.Context, resellerStoreID uuid.UUID) ([]ResellerCatalogEntry, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT rc.id, rc.membership_id, rc.program_product_id, rc.reseller_price_cents,
		       rc.is_active, rc.created_at, rc.updated_at,
		       p.id, COALESCE(p.name, ''), COALESCE(p.slug, ''),
		       COALESCE(p.photo_urls, ARRAY[]::text[]),
		       COALESCE(p.stock, 0), pp.reseller_price_cents,
		       rp.supplier_store_id,
		       COALESCE(sup.name, '')
		FROM reseller_catalog rc
		JOIN reseller_memberships rm ON rm.id = rc.membership_id
		JOIN reseller_program_products pp ON pp.id = rc.program_product_id
		JOIN products p ON p.id = pp.product_id
		JOIN reseller_programs rp ON rp.id = pp.program_id
		LEFT JOIN stores sup ON sup.id = rp.supplier_store_id
		WHERE rm.reseller_store_id = $1
		  AND rc.is_active = true
		ORDER BY rc.created_at DESC
	`, resellerStoreID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ResellerCatalogEntry
	for rows.Next() {
		var e ResellerCatalogEntry
		if err := rows.Scan(
			&e.ID, &e.MembershipID, &e.ProgramProductID, &e.ResellerPriceCents,
			&e.IsActive, &e.CreatedAt, &e.UpdatedAt,
			&e.ProductID, &e.ProductName, &e.ProductSlug,
			&e.PhotoURLs, &e.Stock, &e.ModalCents,
			&e.SupplierStoreID, &e.SupplierStoreName,
		); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

func (r *ResellerRepo) UpdateCatalogPrice(ctx context.Context, catalogID, resellerStoreID uuid.UUID, newPriceCents int64) error {
	// Validate against modal.
	var modal int64
	err := r.pool.QueryRow(ctx, `
		SELECT pp.reseller_price_cents
		FROM reseller_catalog rc
		JOIN reseller_memberships rm ON rm.id = rc.membership_id
		JOIN reseller_program_products pp ON pp.id = rc.program_product_id
		WHERE rc.id = $1 AND rm.reseller_store_id = $2
	`, catalogID, resellerStoreID).Scan(&modal)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrResellerCatalogNotFound
	}
	if err != nil {
		return err
	}
	if newPriceCents < modal {
		return ErrPriceBelowModal
	}
	_, err = r.pool.Exec(ctx, `
		UPDATE reseller_catalog rc
		SET reseller_price_cents = $3, updated_at = now()
		FROM reseller_memberships rm
		WHERE rc.id = $1 AND rc.membership_id = rm.id AND rm.reseller_store_id = $2
	`, catalogID, resellerStoreID, newPriceCents)
	return err
}

func (r *ResellerRepo) RemoveFromCatalog(ctx context.Context, catalogID, resellerStoreID uuid.UUID) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE reseller_catalog rc
		SET is_active = false, updated_at = now()
		FROM reseller_memberships rm
		WHERE rc.id = $1 AND rc.membership_id = rm.id AND rm.reseller_store_id = $2
	`, catalogID, resellerStoreID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrResellerCatalogNotFound
	}
	return nil
}

// ─── Storefront helpers ───────────────────────────────────────────────────────

// ListActiveDropshipProducts returns all active catalog entries for a reseller
// store, joined with live supplier stock. Used by StorefrontHandler.GetStore.
func (r *ResellerRepo) ListActiveDropshipProducts(ctx context.Context, resellerStoreID uuid.UUID) ([]DropshipProduct, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT rc.id, p.id, rp.supplier_store_id,
		       p.name, p.slug, COALESCE(p.description, ''),
		       rc.reseller_price_cents, pp.reseller_price_cents,
		       p.stock,
		       COALESCE(p.photo_urls, ARRAY[]::text[]),
		       COALESCE(p.weight_g, 0), COALESCE(p.length_cm, 0),
		       COALESCE(p.width_cm, 0), COALESCE(p.height_cm, 0),
		       COALESCE(p.product_type, 'physical')
		FROM reseller_catalog rc
		JOIN reseller_memberships rm ON rm.id = rc.membership_id
		JOIN reseller_program_products pp ON pp.id = rc.program_product_id
		JOIN products p ON p.id = pp.product_id
		JOIN reseller_programs rp ON rp.id = pp.program_id
		WHERE rm.reseller_store_id = $1
		  AND rm.is_active = true
		  AND rc.is_active = true
		  AND pp.is_active = true
		  AND rp.is_active = true
		  AND p.status = 'active'
		ORDER BY rc.created_at ASC
	`, resellerStoreID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []DropshipProduct
	for rows.Next() {
		var d DropshipProduct
		if err := rows.Scan(
			&d.CatalogID, &d.ProductID, &d.SupplierStoreID,
			&d.Name, &d.Slug, &d.Description,
			&d.PriceCents, &d.ModalCents, &d.Stock,
			&d.PhotoURLs,
			&d.WeightG, &d.LengthCm, &d.WidthCm, &d.HeightCm,
			&d.ProductType,
		); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// GetDropshipItem fetches one catalog entry + supplier product data for order
// validation during checkout.
func (r *ResellerRepo) GetDropshipItem(ctx context.Context, catalogID uuid.UUID) (*DropshipProduct, error) {
	var d DropshipProduct
	err := r.pool.QueryRow(ctx, `
		SELECT rc.id, p.id, rp.supplier_store_id,
		       p.name, p.slug, COALESCE(p.description, ''),
		       rc.reseller_price_cents, pp.reseller_price_cents,
		       p.stock,
		       COALESCE(p.photo_urls, ARRAY[]::text[]),
		       COALESCE(p.weight_g, 0), COALESCE(p.length_cm, 0),
		       COALESCE(p.width_cm, 0), COALESCE(p.height_cm, 0),
		       COALESCE(p.product_type, 'physical')
		FROM reseller_catalog rc
		JOIN reseller_memberships rm ON rm.id = rc.membership_id
		JOIN reseller_program_products pp ON pp.id = rc.program_product_id
		JOIN products p ON p.id = pp.product_id
		JOIN reseller_programs rp ON rp.id = pp.program_id
		WHERE rc.id = $1
		  AND rc.is_active = true
		  AND pp.is_active = true
		  AND rp.is_active = true
		  AND p.status = 'active'
	`, catalogID).Scan(
		&d.CatalogID, &d.ProductID, &d.SupplierStoreID,
		&d.Name, &d.Slug, &d.Description,
		&d.PriceCents, &d.ModalCents, &d.Stock,
		&d.PhotoURLs,
		&d.WeightG, &d.LengthCm, &d.WidthCm, &d.HeightCm,
		&d.ProductType,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrResellerCatalogNotFound
	}
	return &d, err
}

// DecrementSupplierStock atomically reduces stock on the supplier's product.
// Called during order creation for dropship items.
func (r *ResellerRepo) DecrementSupplierStock(ctx context.Context, tx pgx.Tx, productID uuid.UUID, qty int) error {
	tag, err := tx.Exec(ctx, `
		UPDATE products
		SET stock = stock - $2, updated_at = now()
		WHERE id = $1 AND stock >= $2
	`, productID, qty)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return errors.New("stok produk tidak cukup")
	}
	return nil
}

// ─── invite code helper ───────────────────────────────────────────────────────

const inviteChars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

func generateInviteCode(ctx context.Context, pool *pgxpool.Pool) (string, error) {
	for attempts := 0; attempts < 10; attempts++ {
		code := "SLN"
		for i := 0; i < 6; i++ {
			n, err := rand.Int(rand.Reader, big.NewInt(int64(len(inviteChars))))
			if err != nil {
				return "", err
			}
			code += string(inviteChars[n.Int64()])
		}
		// Check for collision.
		var exists bool
		_ = pool.QueryRow(ctx,
			`SELECT EXISTS(SELECT 1 FROM reseller_programs WHERE invite_code = $1)`, code,
		).Scan(&exists)
		if !exists {
			return code, nil
		}
	}
	return "", errors.New("gagal generate kode unik, coba lagi")
}
