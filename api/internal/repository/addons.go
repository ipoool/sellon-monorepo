package repository

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/sellon/sellon/api/internal/domain/feature"
)

// AddonRepo owns what add-ons exist, what each costs, and which stores hold
// them.
//
// Composition — which features an add-on contains — lives in
// domain/feature, not here. This package knows price and ownership only.
type AddonRepo struct {
	pool *pgxpool.Pool
}

func NewAddonRepo(pool *pgxpool.Pool) *AddonRepo {
	return &AddonRepo{pool: pool}
}

var (
	ErrAddonNotFound = errors.New("addon not found")
	// ErrAddonAlreadyHeld means the store already has a live row for it.
	ErrAddonAlreadyHeld = errors.New("addon already active")
	// ErrAddonNeedsPro is returned when a non-Pro store tries to buy one.
	ErrAddonNeedsPro = errors.New("addon requires the pro plan")
)

// Addon is a purchasable package.
type Addon struct {
	Code        string
	Name        string
	Description string

	MonthlyPriceCents int64
	// Per-month figure when billed twelve months at once, matching how
	// plans.yearly_price_cents works.
	YearlyPriceCents int64

	IsActive  bool
	SortOrder int
}

// PriceForMonths quotes a purchase the same way the plan does, so a seller
// buying Pro and an add-on for a year gets one discount rule, not two.
func (a Addon) PriceForMonths(months int) int64 {
	if months >= 12 && a.YearlyPriceCents > 0 {
		return a.YearlyPriceCents * int64(months)
	}
	return a.MonthlyPriceCents * int64(months)
}

const addonCols = `code, name, description, monthly_price_cents,
	yearly_price_cents, is_active, sort_order`

func scanAddon(row pgx.Row) (*Addon, error) {
	var a Addon
	if err := row.Scan(&a.Code, &a.Name, &a.Description, &a.MonthlyPriceCents,
		&a.YearlyPriceCents, &a.IsActive, &a.SortOrder); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrAddonNotFound
		}
		return nil, err
	}
	return &a, nil
}

// ListAddons returns the catalogue. Retired add-ons are included only for
// the admin screen; the seller-facing list filters them out.
func (r *AddonRepo) ListAddons(ctx context.Context, includeRetired bool) ([]Addon, error) {
	q := `SELECT ` + addonCols + ` FROM addons`
	if !includeRetired {
		q += ` WHERE is_active = true`
	}
	q += ` ORDER BY sort_order, code`

	rows, err := r.pool.Query(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Addon{}
	for rows.Next() {
		var a Addon
		if err := rows.Scan(&a.Code, &a.Name, &a.Description, &a.MonthlyPriceCents,
			&a.YearlyPriceCents, &a.IsActive, &a.SortOrder); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (r *AddonRepo) FindAddon(ctx context.Context, code string) (*Addon, error) {
	return scanAddon(r.pool.QueryRow(ctx,
		`SELECT `+addonCols+` FROM addons WHERE code = $1`, code))
}

// UpdateAddon changes price and availability. The code is immutable: it is
// referenced by store_addons rows and by invoice lines that must stay
// readable, and renaming it would orphan both.
func (r *AddonRepo) UpdateAddon(ctx context.Context, in Addon) (*Addon, error) {
	return scanAddon(r.pool.QueryRow(ctx, `
		UPDATE addons
		SET name = $2, description = $3, monthly_price_cents = $4,
		    yearly_price_cents = $5, is_active = $6, sort_order = $7,
		    updated_at = now()
		WHERE code = $1
		RETURNING `+addonCols,
		in.Code, in.Name, in.Description, in.MonthlyPriceCents,
		in.YearlyPriceCents, in.IsActive, in.SortOrder))
}

// === Ownership ===

// StoreAddon is one add-on a store holds, or used to.
type StoreAddon struct {
	ID        uuid.UUID
	StoreID   uuid.UUID
	AddonCode string

	ActivatedAt time.Time
	// Access runs to here without being billed. Nil when the add-on was
	// activated without a free tail.
	FreeUntil *time.Time
	// The first invoice that charged it. Nil while still free.
	FirstBilledAt *time.Time
	CancelledAt   *time.Time
}

// InFreeTail reports whether this add-on is currently working unbilled.
func (s StoreAddon) InFreeTail() bool {
	return s.FirstBilledAt == nil && s.FreeUntil != nil && time.Now().Before(*s.FreeUntil)
}

const storeAddonCols = `id, store_id, addon_code, activated_at,
	free_until, first_billed_at, cancelled_at`

// ActiveCodes returns the add-on codes a store currently holds.
//
// The hot path: read on every gated request, so it is one indexed query
// returning strings rather than rows.
func (r *AddonRepo) ActiveCodes(ctx context.Context, storeID uuid.UUID) ([]string, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT addon_code FROM store_addons
		WHERE store_id = $1 AND cancelled_at IS NULL
		ORDER BY addon_code`, storeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []string{}
	for rows.Next() {
		var c string
		if err := rows.Scan(&c); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// ListForStore returns the live rows with enough detail for the settings
// screen to say what is billed and what is still free.
func (r *AddonRepo) ListForStore(ctx context.Context, storeID uuid.UUID) ([]StoreAddon, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+storeAddonCols+` FROM store_addons
		WHERE store_id = $1 AND cancelled_at IS NULL
		ORDER BY addon_code`, storeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []StoreAddon{}
	for rows.Next() {
		var s StoreAddon
		if err := rows.Scan(&s.ID, &s.StoreID, &s.AddonCode, &s.ActivatedAt,
			&s.FreeUntil, &s.FirstBilledAt, &s.CancelledAt); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// Activate turns an add-on on for a store.
//
// The free tail is the product rule: the add-on works immediately and is
// first charged on the next renewal, so nobody is billed for a part-month
// they cannot verify on a calculator. It is granted ONCE per store per
// add-on — otherwise activating on the last day of each period and
// cancelling before renewal would make the add-on permanently free.
//
// One statement, so the "have they had it before" question and the insert
// cannot be answered by different snapshots.
func (r *AddonRepo) Activate(ctx context.Context, storeID uuid.UUID, code string, periodEnd *time.Time) (*StoreAddon, error) {
	var s StoreAddon
	err := r.pool.QueryRow(ctx, `
		INSERT INTO store_addons (store_id, addon_code, free_until)
		SELECT $1, a.code,
		       CASE WHEN NOT EXISTS (
		                SELECT 1 FROM store_addons prior
		                WHERE prior.store_id = $1 AND prior.addon_code = a.code)
		            THEN $3::timestamptz
		       END
		FROM addons a
		WHERE a.code = $2 AND a.is_active = true
		RETURNING `+storeAddonCols,
		storeID, code, periodEnd).
		Scan(&s.ID, &s.StoreID, &s.AddonCode, &s.ActivatedAt,
			&s.FreeUntil, &s.FirstBilledAt, &s.CancelledAt)

	if errors.Is(err, pgx.ErrNoRows) {
		// No row from `addons`: unknown or retired.
		return nil, ErrAddonNotFound
	}
	if err != nil {
		if isUniqueViolation(err) {
			// The live-row index fired: they already have it.
			return nil, ErrAddonAlreadyHeld
		}
		return nil, err
	}
	return &s, nil
}

// Cancel switches an add-on off.
//
// Guarded on being live, so a double-click cancels once. Access stops
// immediately rather than running to the period end: the seller asked for
// it off, and a "you still have it until the 31st" rule is a surprise in
// the direction nobody wants.
func (r *AddonRepo) Cancel(ctx context.Context, storeID uuid.UUID, code string) error {
	ct, err := r.pool.Exec(ctx, `
		UPDATE store_addons SET cancelled_at = now()
		WHERE store_id = $1 AND addon_code = $2 AND cancelled_at IS NULL`,
		storeID, code)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrAddonNotFound
	}
	return nil
}

// EntitlementsFor resolves a store's plan and add-ons into one answer.
//
// Replaces the bare plan lookup every gate used to do: a tier stopped being
// the whole story the moment features could be bought individually.
func (r *AddonRepo) EntitlementsFor(ctx context.Context, storeID uuid.UUID, plan string) (feature.Entitlements, error) {
	codes, err := r.ActiveCodes(ctx, storeID)
	if err != nil {
		return feature.Entitlements{}, err
	}
	return feature.EntitlementsFor(plan, codes), nil
}
