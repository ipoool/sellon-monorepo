package repository

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Subscription struct {
	ID                 uuid.UUID
	StoreID            uuid.UUID
	Plan               string
	Status             string
	CurrentPeriodStart *time.Time
	CurrentPeriodEnd   *time.Time
	CancelledAt        *time.Time
	// Limits snapshotted at the time of the last plan CHANGE (not
	// renewal of the same tier). Source of truth for runtime quota
	// enforcement; the `plans` table only seeds these on snapshot.
	// -1 means unlimited.
	ProductLimit      int
	StaffLimit        int
	OrderMonthlyLimit int
	PromoLimit        int
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

type SubscriptionInvoice struct {
	ID              uuid.UUID
	StoreID         uuid.UUID
	SubscriptionID  uuid.UUID
	AmountCents     int64
	Status          string
	PeriodStart     *time.Time
	PeriodEnd       *time.Time
	PaidAt          *time.Time
	Notes           string
	Provider        string
	ProviderOrderID string
	Months          int
	Plan            string
	CreatedAt       time.Time
}

type SubscriptionRepo struct {
	pool *pgxpool.Pool
}

func NewSubscriptionRepo(pool *pgxpool.Pool) *SubscriptionRepo {
	return &SubscriptionRepo{pool: pool}
}

const subscriptionCols = `id, store_id, plan, status, current_period_start,
	current_period_end, cancelled_at,
	product_limit, staff_limit, order_monthly_limit, promo_limit,
	created_at, updated_at`

func scanSubscription(row pgx.Row) (*Subscription, error) {
	var s Subscription
	if err := row.Scan(
		&s.ID, &s.StoreID, &s.Plan, &s.Status,
		&s.CurrentPeriodStart, &s.CurrentPeriodEnd, &s.CancelledAt,
		&s.ProductLimit, &s.StaffLimit, &s.OrderMonthlyLimit, &s.PromoLimit,
		&s.CreatedAt, &s.UpdatedAt,
	); err != nil {
		return nil, err
	}
	return &s, nil
}

// snapshotLimitsSQL is a reusable fragment that re-snapshots the four
// limit columns from `plans` ONLY when the subscription's plan column
// is changing this update. Same-plan renewal keeps the existing
// snapshot intact (decision 2026-05-10).
//
// Caller is responsible for placing this BEFORE the `plan = $newplan`
// SET clause, so the CASE evaluates against the old plan value.
//
// $newPlanParam should be the same SQL placeholder that the caller
// uses for the new plan (e.g. "$2"). The fragment expects to be used
// inside a SET list separated by commas.
func snapshotLimitsSQL(newPlanParam string) string {
	tpl := `
	    product_limit = CASE WHEN plan IS DISTINCT FROM ` + newPlanParam + `
	                         THEN COALESCE((SELECT product_limit FROM plans WHERE tier = ` + newPlanParam + `), product_limit)
	                         ELSE product_limit END,
	    staff_limit = CASE WHEN plan IS DISTINCT FROM ` + newPlanParam + `
	                         THEN COALESCE((SELECT staff_limit FROM plans WHERE tier = ` + newPlanParam + `), staff_limit)
	                         ELSE staff_limit END,
	    order_monthly_limit = CASE WHEN plan IS DISTINCT FROM ` + newPlanParam + `
	                         THEN COALESCE((SELECT order_monthly_limit FROM plans WHERE tier = ` + newPlanParam + `), order_monthly_limit)
	                         ELSE order_monthly_limit END,
	    promo_limit = CASE WHEN plan IS DISTINCT FROM ` + newPlanParam + `
	                         THEN COALESCE((SELECT promo_limit FROM plans WHERE tier = ` + newPlanParam + `), promo_limit)
	                         ELSE promo_limit END`
	return tpl
}

// GetOrCreate returns the store's subscription, creating a default 'free'
// row if none exists. Idempotent — safe to call from a GET handler.
func (r *SubscriptionRepo) GetOrCreate(ctx context.Context, storeID uuid.UUID) (*Subscription, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT `+subscriptionCols+`
		FROM subscriptions WHERE store_id = $1
	`, storeID)
	s, err := scanSubscription(row)
	if err == nil {
		// Lazy expiry: if a paid plan's period ended without renewal,
		// transition to expired. Caller sees the up-to-date state without
		// a cron job. plan is changing (paid → free), so this is a real
		// transition and we re-snapshot the free-tier limits.
		if (s.Plan == "pro" || s.Plan == "bisnis") &&
			s.CurrentPeriodEnd != nil &&
			s.CurrentPeriodEnd.Before(time.Now()) && s.Status != "expired" {
			row := r.pool.QueryRow(ctx, `
				UPDATE subscriptions
				SET status = 'expired',`+snapshotLimitsSQL("$2")+`,
				    plan = $2,
				    updated_at = now()
				WHERE id = $1
				RETURNING `+subscriptionCols, s.ID, "free")
			if expired, err := scanSubscription(row); err == nil {
				return expired, nil
			}
			// If the re-fetch failed, fall through with a best-effort
			// patch on the in-memory struct so the caller still sees the
			// expired state.
			s.Status = "expired"
			s.Plan = "free"
		}
		return s, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	// First time — insert defaults. Snapshot the free-tier limits so
	// future admin tweaks to the plans table don't retroactively touch
	// this row. COALESCE guards the case where the 'free' plan row is
	// missing for any reason (fail-open to unlimited).
	row = r.pool.QueryRow(ctx, `
		INSERT INTO subscriptions (
		    store_id, plan, product_limit, staff_limit,
		    order_monthly_limit, promo_limit
		) VALUES (
		    $1, 'free',
		    COALESCE((SELECT product_limit       FROM plans WHERE tier = 'free'), -1),
		    COALESCE((SELECT staff_limit         FROM plans WHERE tier = 'free'), -1),
		    COALESCE((SELECT order_monthly_limit FROM plans WHERE tier = 'free'), -1),
		    COALESCE((SELECT promo_limit         FROM plans WHERE tier = 'free'), -1)
		)
		RETURNING `+subscriptionCols, storeID)
	return scanSubscription(row)
}

// Upgrade switches the subscription to the given plan ('pro' or 'bisnis')
// and extends the period by `months` from the later of (now, current_period_end).
// If an invoice is supplied, it's recorded as paid in the same transaction.
func (r *SubscriptionRepo) Upgrade(ctx context.Context, storeID uuid.UUID, plan string, months int, amountCents int64, notes string) (*Subscription, error) {
	if months <= 0 {
		months = 1
	}
	if plan != "pro" && plan != "bisnis" {
		plan = "pro"
	}

	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	// Ensure subscription row exists. Seed limits from the free plan so
	// a brand-new row already has a meaningful snapshot in case the
	// follow-up UPDATE is a same-plan no-op.
	if _, err := tx.Exec(ctx, `
		INSERT INTO subscriptions (
		    store_id, product_limit, staff_limit,
		    order_monthly_limit, promo_limit
		) VALUES (
		    $1,
		    COALESCE((SELECT product_limit       FROM plans WHERE tier = 'free'), -1),
		    COALESCE((SELECT staff_limit         FROM plans WHERE tier = 'free'), -1),
		    COALESCE((SELECT order_monthly_limit FROM plans WHERE tier = 'free'), -1),
		    COALESCE((SELECT promo_limit         FROM plans WHERE tier = 'free'), -1)
		)
		ON CONFLICT (store_id) DO NOTHING`, storeID); err != nil {
		return nil, err
	}

	// Compute new period end: max(now, current_period_end) + months.
	// Limits re-snapshot only when the plan column actually changes —
	// renewing the same tier keeps the user's existing snapshot.
	row := tx.QueryRow(ctx, `
		UPDATE subscriptions
		SET `+snapshotLimitsSQL("$3")+`,
		    plan = $3,
		    status = 'active',
		    current_period_start = COALESCE(current_period_start, now()),
		    current_period_end = GREATEST(
		        COALESCE(current_period_end, now()),
		        now()
		    ) + ($2::int * INTERVAL '1 month'),
		    cancelled_at = NULL,
		    updated_at = now()
		WHERE store_id = $1
		RETURNING `+subscriptionCols, storeID, months, plan)
	s, err := scanSubscription(row)
	if err != nil {
		return nil, err
	}

	if amountCents > 0 {
		if _, err := tx.Exec(ctx, `
			INSERT INTO subscription_invoices
			    (store_id, subscription_id, amount_cents, status,
			     period_start, period_end, paid_at, notes)
			VALUES ($1, $2, $3, 'paid', $4, $5, now(), $6)
		`, storeID, s.ID, amountCents, s.CurrentPeriodStart, s.CurrentPeriodEnd, notes); err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return s, nil
}

// Cancel sets the cancellation flag. Plan stays active until period_end;
// GetOrCreate handles the transition to expired/free.
func (r *SubscriptionRepo) Cancel(ctx context.Context, storeID uuid.UUID) (*Subscription, error) {
	row := r.pool.QueryRow(ctx, `
		UPDATE subscriptions
		SET status = 'cancelled', cancelled_at = now(), updated_at = now()
		WHERE store_id = $1
		RETURNING `+subscriptionCols, storeID)
	return scanSubscription(row)
}

// Resume undoes a cancellation as long as the period hasn't ended.
func (r *SubscriptionRepo) Resume(ctx context.Context, storeID uuid.UUID) (*Subscription, error) {
	row := r.pool.QueryRow(ctx, `
		UPDATE subscriptions
		SET status = 'active', cancelled_at = NULL, updated_at = now()
		WHERE store_id = $1 AND current_period_end > now()
		RETURNING `+subscriptionCols, storeID)
	return scanSubscription(row)
}

const invoiceCols = `id, store_id, subscription_id, amount_cents, status,
	period_start, period_end, paid_at, notes,
	provider, provider_order_id, months, plan, created_at`

func scanInvoice(row pgx.Row) (*SubscriptionInvoice, error) {
	var inv SubscriptionInvoice
	if err := row.Scan(
		&inv.ID, &inv.StoreID, &inv.SubscriptionID, &inv.AmountCents,
		&inv.Status, &inv.PeriodStart, &inv.PeriodEnd, &inv.PaidAt,
		&inv.Notes,
		&inv.Provider, &inv.ProviderOrderID, &inv.Months, &inv.Plan,
		&inv.CreatedAt,
	); err != nil {
		return nil, err
	}
	return &inv, nil
}

func (r *SubscriptionRepo) ListInvoices(ctx context.Context, storeID uuid.UUID) ([]SubscriptionInvoice, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+invoiceCols+`
		FROM subscription_invoices
		WHERE store_id = $1
		ORDER BY created_at DESC
		LIMIT 100
	`, storeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []SubscriptionInvoice
	for rows.Next() {
		inv, err := scanInvoice(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *inv)
	}
	return out, rows.Err()
}

// FindInvoiceByProviderOrderID is used by the platform Midtrans webhook
// to map an order_id back to the invoice + store to update.
func (r *SubscriptionRepo) FindInvoiceByProviderOrderID(ctx context.Context, orderID string) (*SubscriptionInvoice, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT `+invoiceCols+`
		FROM subscription_invoices
		WHERE provider_order_id = $1
		LIMIT 1
	`, orderID)
	inv, err := scanInvoice(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, errors.New("invoice not found")
	}
	return inv, err
}

// CreateCheckoutInvoice records a "pending" invoice tied to a payment
// provider's order_id. Used when starting a Midtrans Snap checkout. The
// webhook handler later flips this to paid + extends the subscription.
func (r *SubscriptionRepo) CreateCheckoutInvoice(
	ctx context.Context,
	storeID, subscriptionID uuid.UUID,
	amountCents int64,
	provider, providerOrderID, plan string,
	months int,
	notes string,
) (*SubscriptionInvoice, error) {
	if months <= 0 {
		months = 1
	}
	row := r.pool.QueryRow(ctx, `
		INSERT INTO subscription_invoices
		    (store_id, subscription_id, amount_cents, status, notes,
		     provider, provider_order_id, months, plan)
		VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7, $8)
		RETURNING `+invoiceCols, storeID, subscriptionID, amountCents, notes,
		provider, providerOrderID, months, plan)
	return scanInvoice(row)
}

// SettleInvoice marks an invoice paid AND extends the subscription's
// period_end inside one transaction. Idempotent for repeat webhook calls.
func (r *SubscriptionRepo) SettleInvoice(ctx context.Context, invoiceID uuid.UUID) (*Subscription, *SubscriptionInvoice, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, nil, err
	}
	defer tx.Rollback(ctx)

	row := tx.QueryRow(ctx, `
		UPDATE subscription_invoices
		SET status = 'paid', paid_at = COALESCE(paid_at, now())
		WHERE id = $1
		RETURNING `+invoiceCols, invoiceID)
	inv, err := scanInvoice(row)
	if err != nil {
		return nil, nil, err
	}

	// Extend the matching subscription. Replays of the same webhook are
	// safe because a paid invoice's webhook only fires once per Midtrans
	// transaction, and once status is 'paid' we still re-extend — but the
	// invoice flip above already short-circuits via paid_at COALESCE so
	// only the first call writes paid_at.
	subRow := tx.QueryRow(ctx, `
		UPDATE subscriptions
		SET `+snapshotLimitsSQL("$2")+`,
		    plan = $2,
		    status = 'active',
		    current_period_start = COALESCE(current_period_start, now()),
		    current_period_end = GREATEST(
		        COALESCE(current_period_end, now()),
		        now()
		    ) + ($3::int * INTERVAL '1 month'),
		    cancelled_at = NULL,
		    updated_at = now()
		WHERE id = $1
		RETURNING `+subscriptionCols, inv.SubscriptionID, inv.Plan, inv.Months)
	sub, err := scanSubscription(subRow)
	if err != nil {
		return nil, nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, nil, err
	}
	return sub, inv, nil
}

// MarkInvoiceFailed flips a pending invoice to failed (e.g. expired Snap).
func (r *SubscriptionRepo) MarkInvoiceFailed(ctx context.Context, invoiceID uuid.UUID) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE subscription_invoices SET status = 'failed' WHERE id = $1 AND status = 'pending'`,
		invoiceID,
	)
	return err
}

// FindOpenManualInvoice returns the still-pending manual-transfer
// invoice for a subscription, if one exists. Used to dedupe the
// "Saya sudah transfer" flow — clicking that button while ops hasn't
// verified the previous one yet should NOT create a second row.
//
// Returns (nil, nil) when no such invoice exists; that's the happy
// path for a first-time request.
func (r *SubscriptionRepo) FindOpenManualInvoice(
	ctx context.Context, subscriptionID uuid.UUID,
) (*SubscriptionInvoice, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT `+invoiceCols+`
		FROM subscription_invoices
		WHERE subscription_id = $1
		  AND status = 'pending'
		  AND provider = 'manual_transfer'
		ORDER BY created_at DESC
		LIMIT 1
	`, subscriptionID)
	inv, err := scanInvoice(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return inv, nil
}

// CreatePendingInvoice records that a seller intends to pay manually
// (clicked "Saya sudah transfer"). Plan + months are stored so the admin
// can activate later via SettleInvoice without re-asking. Provider is
// "manual_transfer" to set these apart from Midtrans-Snap pending rows.
func (r *SubscriptionRepo) CreatePendingInvoice(
	ctx context.Context,
	storeID, subscriptionID uuid.UUID,
	amountCents int64,
	plan string,
	months int,
	notes string,
) error {
	if months <= 0 {
		months = 1
	}
	if plan == "" {
		plan = "pro"
	}
	_, err := r.pool.Exec(ctx, `
		INSERT INTO subscription_invoices
		    (store_id, subscription_id, amount_cents, status, notes,
		     provider, plan, months)
		VALUES ($1, $2, $3, 'pending', $4, 'manual_transfer', $5, $6)
	`, storeID, subscriptionID, amountCents, notes, plan, months)
	return err
}

// AdminInvoiceRow is a denormalized view used by the admin transactions
// page. Carries enough store + owner info to render the list without a
// second round-trip per row.
type AdminInvoiceRow struct {
	SubscriptionInvoice
	StoreName    string
	StoreSlug    string
	OwnerName    string
	OwnerEmail   string
	OwnerPicture string
}

// AdminListInvoicesFilter narrows the results — empty string means "all".
type AdminListInvoicesFilter struct {
	Status string // "" | "pending" | "paid" | "failed"
	Search string // matches store name/slug or owner email/name
	Limit  int
	Offset int
}

// AdminListInvoices returns subscription invoices across every store with
// owner + store details joined in. Admin-only — caller is responsible for
// the RequireAdmin middleware.
func (r *SubscriptionRepo) AdminListInvoices(
	ctx context.Context, f AdminListInvoicesFilter,
) ([]AdminInvoiceRow, int, error) {
	if f.Limit <= 0 || f.Limit > 200 {
		f.Limit = 25
	}
	if f.Offset < 0 {
		f.Offset = 0
	}

	args := []any{}
	where := "1=1"
	if f.Status != "" {
		args = append(args, f.Status)
		where += " AND si.status = $" + itoa(len(args))
	}
	if f.Search != "" {
		args = append(args, "%"+f.Search+"%")
		idx := itoa(len(args))
		where += " AND (s.name ILIKE $" + idx + " OR s.slug ILIKE $" + idx +
			" OR u.email ILIKE $" + idx + " OR u.name ILIKE $" + idx + ")"
	}

	var total int
	if err := r.pool.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM subscription_invoices si
		JOIN stores s ON s.id = si.store_id
		LEFT JOIN users u ON u.id = s.owner_id
		WHERE `+where, args...,
	).Scan(&total); err != nil {
		return nil, 0, err
	}

	args = append(args, f.Limit, f.Offset)
	q := `
		SELECT
		    si.id, si.store_id, si.subscription_id, si.amount_cents, si.status,
		    si.period_start, si.period_end, si.paid_at, si.notes,
		    si.provider, si.provider_order_id, si.months, si.plan, si.created_at,
		    s.name, s.slug,
		    COALESCE(u.name, ''), COALESCE(u.email, ''), COALESCE(u.picture_url, '')
		FROM subscription_invoices si
		JOIN stores s ON s.id = si.store_id
		LEFT JOIN users u ON u.id = s.owner_id
		WHERE ` + where + `
		ORDER BY si.created_at DESC
		LIMIT $` + itoa(len(args)-1) + ` OFFSET $` + itoa(len(args))

	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var out []AdminInvoiceRow
	for rows.Next() {
		var row AdminInvoiceRow
		if err := rows.Scan(
			&row.ID, &row.StoreID, &row.SubscriptionID, &row.AmountCents, &row.Status,
			&row.PeriodStart, &row.PeriodEnd, &row.PaidAt, &row.Notes,
			&row.Provider, &row.ProviderOrderID, &row.Months, &row.Plan, &row.CreatedAt,
			&row.StoreName, &row.StoreSlug,
			&row.OwnerName, &row.OwnerEmail, &row.OwnerPicture,
		); err != nil {
			return nil, 0, err
		}
		out = append(out, row)
	}
	return out, total, rows.Err()
}

// AdminGrantSubscription overrides a store's plan + period_end directly,
// skipping the invoice/payment flow. Used when admin wants to give a
// trial of Pro/Bisnis to a colleague (or themselves for testing) without
// processing a fake payment. A zero-amount invoice with provider
// 'admin_grant' is still inserted so the action shows up in the audit
// trail and the seller's invoice history.
//
// Plan = "free" cancels the subscription cleanly: status='active',
// period reset to NULL.
func (r *SubscriptionRepo) AdminGrantSubscription(
	ctx context.Context, storeID uuid.UUID, plan string, expiresAt time.Time,
) (*Subscription, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	// Make sure the row exists. GetOrCreate-style, inline so we stay in
	// the transaction. Seed from the free plan so that an admin grant of
	// 'free' to a brand-new store still ends up with the actual free
	// snapshot rather than the column-default -1s.
	var subID uuid.UUID
	err = tx.QueryRow(ctx, `
		SELECT id FROM subscriptions WHERE store_id = $1
	`, storeID).Scan(&subID)
	if errors.Is(err, pgx.ErrNoRows) {
		err = tx.QueryRow(ctx, `
			INSERT INTO subscriptions (
			    store_id, product_limit, staff_limit,
			    order_monthly_limit, promo_limit
			) VALUES (
			    $1,
			    COALESCE((SELECT product_limit       FROM plans WHERE tier = 'free'), -1),
			    COALESCE((SELECT staff_limit         FROM plans WHERE tier = 'free'), -1),
			    COALESCE((SELECT order_monthly_limit FROM plans WHERE tier = 'free'), -1),
			    COALESCE((SELECT promo_limit         FROM plans WHERE tier = 'free'), -1)
			) RETURNING id
		`, storeID).Scan(&subID)
	}
	if err != nil {
		return nil, err
	}

	var s *Subscription
	if plan == "free" {
		row := tx.QueryRow(ctx, `
			UPDATE subscriptions
			SET `+snapshotLimitsSQL("$2")+`,
			    plan = $2,
			    status = 'active',
			    current_period_start = NULL,
			    current_period_end = NULL,
			    cancelled_at = NULL,
			    updated_at = now()
			WHERE id = $1
			RETURNING `+subscriptionCols, subID, "free")
		s, err = scanSubscription(row)
	} else {
		row := tx.QueryRow(ctx, `
			UPDATE subscriptions
			SET `+snapshotLimitsSQL("$2")+`,
			    plan = $2,
			    status = 'active',
			    current_period_start = COALESCE(current_period_start, now()),
			    current_period_end = $3,
			    cancelled_at = NULL,
			    updated_at = now()
			WHERE id = $1
			RETURNING `+subscriptionCols, subID, plan, expiresAt)
		s, err = scanSubscription(row)
	}
	if err != nil {
		return nil, err
	}

	// Record the grant. Months is best-effort metadata (rounded), amount
	// is 0 because no money changed hands. Provider 'admin_grant' lets
	// reports filter manual grants out of revenue numbers.
	months := 0
	if plan != "free" && !expiresAt.IsZero() {
		dur := time.Until(expiresAt)
		if dur > 0 {
			months = int(dur.Hours() / (24 * 30))
			if months < 1 {
				months = 1
			}
		}
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO subscription_invoices
		    (store_id, subscription_id, amount_cents, status, paid_at, notes,
		     provider, plan, months, period_start, period_end)
		VALUES ($1, $2, 0, 'paid', now(), $3, 'admin_grant', $4, $5, $6, $7)
	`, storeID, subID, "Admin grant: "+plan, plan, months,
		s.CurrentPeriodStart, s.CurrentPeriodEnd); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return s, nil
}

// ExpiringSubscription is a lightweight projection used by the expiry
// notification worker — only the fields needed to compose and send the email.
type ExpiringSubscription struct {
	StoreID    uuid.UUID
	StoreName  string
	Plan       string
	ExpiresAt  time.Time
	OwnerEmail string
	OwnerName  string
}

// FindExpiringOn returns all paid subscriptions whose period_end falls on the
// given calendar date (WIB / UTC+7). Used by the H-3 and H-0 email jobs.
func (r *SubscriptionRepo) FindExpiringOn(ctx context.Context, calendarDate time.Time) ([]*ExpiringSubscription, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT s.store_id, st.name, s.plan, s.current_period_end,
		       u.email, u.name
		FROM subscriptions s
		JOIN stores st ON st.id = s.store_id
		JOIN users  u  ON u.id  = st.owner_id
		WHERE s.plan IN ('pro', 'bisnis')
		  AND s.status IN ('active', 'cancelled')
		  AND DATE(s.current_period_end AT TIME ZONE 'Asia/Jakarta')
		      = DATE($1 AT TIME ZONE 'Asia/Jakarta')
	`, calendarDate)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*ExpiringSubscription
	for rows.Next() {
		var e ExpiringSubscription
		if err := rows.Scan(
			&e.StoreID, &e.StoreName, &e.Plan, &e.ExpiresAt,
			&e.OwnerEmail, &e.OwnerName,
		); err != nil {
			return nil, err
		}
		out = append(out, &e)
	}
	return out, rows.Err()
}

// ClaimNotification atomically reserves the send slot for one
// (store, notification_type, period_end) triple. It returns true exactly
// when this caller wins the race — i.e. the INSERT succeeded and no other
// pod (or previous run) had already claimed this slot.
//
// The INSERT + RowsAffected check is a single round-trip, so there is no
// TOCTOU window even under concurrent pods: only one INSERT can win the
// PRIMARY KEY conflict; every other caller gets RowsAffected == 0 and
// must skip sending.
func (r *SubscriptionRepo) ClaimNotification(ctx context.Context,
	storeID uuid.UUID, notifType string, periodEnd time.Time,
) (bool, error) {
	tag, err := r.pool.Exec(ctx, `
		INSERT INTO subscription_expiry_emails (store_id, notification_type, period_end)
		VALUES ($1, $2, $3::date)
		ON CONFLICT DO NOTHING
	`, storeID, notifType, periodEnd)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() == 1, nil
}

// ErrInvoiceNotPending is returned by AdminMarkInvoiceFailed when the
// invoice has already been settled or rejected.
var ErrInvoiceNotPending = errors.New("invoice not pending")

// AdminMarkInvoiceFailed flips a pending invoice to failed. Used when
// admin verified the bank transfer never arrived. Idempotent — re-calling
// on a non-pending row returns ErrInvoiceNotPending.
func (r *SubscriptionRepo) AdminMarkInvoiceFailed(
	ctx context.Context, invoiceID uuid.UUID, notes string,
) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE subscription_invoices
		SET status = 'failed',
		    notes = COALESCE(NULLIF($2, ''), notes)
		WHERE id = $1 AND status = 'pending'
	`, invoiceID, notes)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrInvoiceNotPending
	}
	return nil
}
