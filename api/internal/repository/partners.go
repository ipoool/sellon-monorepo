package repository

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PartnerRepo owns the partner registry, the signup-time attribution bond,
// and the commission ledger.
//
// Platform-level, like PhotoBoost: nothing here is scoped by store_id. A
// partner is someone who sends SellOn users, and the admin console is the
// only human-facing surface.
type PartnerRepo struct {
	pool *pgxpool.Pool
}

func NewPartnerRepo(pool *pgxpool.Pool) *PartnerRepo {
	return &PartnerRepo{pool: pool}
}

var (
	ErrPartnerNotFound  = errors.New("partner not found")
	ErrPartnerCodeTaken = errors.New("partner code taken")
	ErrCommissionLocked = errors.New("commission already paid or void")
	ErrPayoutNothingDue = errors.New("no commission due")
)

// Partner is one promoting party.
type Partner struct {
	ID   uuid.UUID
	Code string
	Name string

	ContactName  string
	ContactEmail string
	ContactPhone string

	CommissionBps int
	Status        string
	Notes         string

	CreatedAt time.Time
	UpdatedAt time.Time
}

// Stats are the rollups the admin list leads with.
type PartnerStats struct {
	Referrals  int   // users who signed up through the link
	Converted  int   // of those, how many ever paid
	OwedCents  int64 // earned but not yet paid out — the actionable number
	PaidCents  int64
	GrossCents int64 // what those customers paid SellOn
}

type PartnerWithStats struct {
	Partner
	PartnerStats
}

const partnerCols = `
	id, code, name, contact_name, contact_email, contact_phone,
	commission_bps, status, notes, created_at, updated_at`

func scanPartner(row pgx.Row) (*Partner, error) {
	var p Partner
	if err := row.Scan(&p.ID, &p.Code, &p.Name, &p.ContactName, &p.ContactEmail,
		&p.ContactPhone, &p.CommissionBps, &p.Status, &p.Notes,
		&p.CreatedAt, &p.UpdatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrPartnerNotFound
		}
		return nil, err
	}
	return &p, nil
}

// === Partners ===

type CreatePartnerInput struct {
	Code          string
	Name          string
	ContactName   string
	ContactEmail  string
	ContactPhone  string
	CommissionBps int
	Notes         string
	CreatedBy     uuid.UUID
}

func (r *PartnerRepo) CreatePartner(ctx context.Context, in CreatePartnerInput) (*Partner, error) {
	p, err := scanPartner(r.pool.QueryRow(ctx, `
		INSERT INTO partners (code, name, contact_name, contact_email, contact_phone,
		                      commission_bps, notes, created_by)
		VALUES (UPPER($1), $2, $3, $4, $5, $6, $7, $8)
		RETURNING `+partnerCols,
		strings.TrimSpace(in.Code), strings.TrimSpace(in.Name), in.ContactName,
		strings.TrimSpace(in.ContactEmail), in.ContactPhone, in.CommissionBps,
		in.Notes, nullUUID(in.CreatedBy)))
	if err != nil && isUniqueViolation(err) {
		return nil, ErrPartnerCodeTaken
	}
	return p, err
}

type UpdatePartnerInput struct {
	ID            uuid.UUID
	Name          string
	ContactName   string
	ContactEmail  string
	ContactPhone  string
	CommissionBps int
	Status        string
	Notes         string
}

// UpdatePartner changes everything except the code. The code is printed on
// banners and pasted into chat threads; letting it change would orphan links
// that are already in the world.
func (r *PartnerRepo) UpdatePartner(ctx context.Context, in UpdatePartnerInput) (*Partner, error) {
	return scanPartner(r.pool.QueryRow(ctx, `
		UPDATE partners
		SET name = $2, contact_name = $3, contact_email = $4, contact_phone = $5,
		    commission_bps = $6, status = $7, notes = $8, updated_at = now()
		WHERE id = $1
		RETURNING `+partnerCols,
		in.ID, strings.TrimSpace(in.Name), in.ContactName,
		strings.TrimSpace(in.ContactEmail), in.ContactPhone,
		in.CommissionBps, in.Status, in.Notes))
}

func (r *PartnerRepo) FindPartnerByID(ctx context.Context, id uuid.UUID) (*Partner, error) {
	return scanPartner(r.pool.QueryRow(ctx,
		`SELECT `+partnerCols+` FROM partners WHERE id = $1`, id))
}

// FindPartnerByCode resolves a code from a URL. Case-insensitive, and only
// ever returns an active partner — a paused one must not keep collecting.
func (r *PartnerRepo) FindActivePartnerByCode(ctx context.Context, code string) (*Partner, error) {
	return scanPartner(r.pool.QueryRow(ctx,
		`SELECT `+partnerCols+` FROM partners
		 WHERE UPPER(code) = UPPER($1) AND status = 'active'`, strings.TrimSpace(code)))
}

// ListPartners returns every partner with its rollups, newest first, active
// ones on top.
func (r *PartnerRepo) ListPartners(ctx context.Context) ([]PartnerWithStats, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+partnerCols+`,
		  (SELECT count(*) FROM partner_referrals pr WHERE pr.partner_id = p.id),
		  (SELECT count(*) FROM partner_commissions c
		     WHERE c.partner_id = p.id AND c.status <> 'void'),
		  (SELECT COALESCE(sum(c.commission_cents), 0) FROM partner_commissions c
		     WHERE c.partner_id = p.id AND c.status = 'earned'),
		  (SELECT COALESCE(sum(c.commission_cents), 0) FROM partner_commissions c
		     WHERE c.partner_id = p.id AND c.status = 'paid'),
		  (SELECT COALESCE(sum(c.base_amount_cents), 0) FROM partner_commissions c
		     WHERE c.partner_id = p.id AND c.status <> 'void')
		FROM partners p
		ORDER BY (p.status = 'active') DESC, p.created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []PartnerWithStats{}
	for rows.Next() {
		var x PartnerWithStats
		if err := rows.Scan(&x.ID, &x.Code, &x.Name, &x.ContactName, &x.ContactEmail,
			&x.ContactPhone, &x.CommissionBps, &x.Status, &x.Notes,
			&x.CreatedAt, &x.UpdatedAt,
			&x.Referrals, &x.Converted, &x.OwedCents, &x.PaidCents, &x.GrossCents); err != nil {
			return nil, err
		}
		out = append(out, x)
	}
	return out, rows.Err()
}

// === Attribution ===

// BondReferral ties a brand-new user to a partner, once and for ever.
//
// First-touch wins by construction: the unique index on user_id absorbs a
// second attempt, including one carrying a different partner's code. An
// unknown or inactive code resolves to zero rows.
//
// Callers treat failure as non-fatal. A partner code is marketing metadata;
// it must never be the reason a signup fails.
func (r *PartnerRepo) BondReferral(ctx context.Context, userID uuid.UUID, code, method, landingPath string) error {
	code = strings.TrimSpace(code)
	if code == "" {
		return nil
	}
	_, err := r.pool.Exec(ctx, `
		INSERT INTO partner_referrals (partner_id, user_id, code_used, signup_method, landing_path)
		SELECT p.id, $1, p.code, $3, $4
		FROM partners p
		WHERE UPPER(p.code) = UPPER($2) AND p.status = 'active'
		ON CONFLICT (user_id) DO NOTHING
	`, userID, code, method, landingPath)
	return err
}

// AttachReferralByEmail is the admin escape hatch: a visitor who already had
// an account before the event gets no automatic bond (correct — first touch),
// but the operator may still genuinely owe the partner for them.
//
// Still goes through the same unique index, so it can never steal a user who
// already belongs to another partner.
func (r *PartnerRepo) AttachReferralByEmail(ctx context.Context, partnerID uuid.UUID, email string) error {
	ct, err := r.pool.Exec(ctx, `
		INSERT INTO partner_referrals (partner_id, user_id, code_used, signup_method)
		SELECT $1, u.id, p.code, 'admin'
		FROM users u, partners p
		WHERE LOWER(u.email) = LOWER($2) AND p.id = $1
		ON CONFLICT (user_id) DO NOTHING
	`, partnerID, strings.TrimSpace(email))
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrPartnerNotFound
	}
	return nil
}

// === Commission accrual ===

// accrueCommissionSQL mints a commission for a freshly settled invoice.
//
// One statement, no read-then-write. Every rule that matters is expressed as
// a join or an index rather than a branch:
//
//   - no bond -> the partner_referrals join yields nothing -> no-op
//   - a renewal -> partner_commissions_user_once rejects -> ON CONFLICT
//   - a replayed webhook -> partner_commissions_invoice_uniq rejects
//   - an admin grant -> excluded by amount > 0 and provider
//
// ON CONFLICT names no target on purpose: either unique index may be the one
// that fires, and a target can only name one of them.
//
// Integer division truncates, so a fractional rupiah always rounds in the
// platform's favour, deterministically.
const accrueCommissionSQL = `
	INSERT INTO partner_commissions (
		partner_id, referral_id, referred_user_id, referred_user_email,
		store_id, store_name, invoice_id, plan, months,
		base_amount_cents, commission_bps, commission_cents)
	SELECT pr.partner_id, pr.id, u.id, u.email,
	       s.id, s.name, i.id, i.plan, i.months,
	       i.amount_cents, p.commission_bps,
	       (i.amount_cents * p.commission_bps) / 10000
	FROM subscription_invoices i
	JOIN stores            s  ON s.id = i.store_id
	JOIN users             u  ON u.id = s.owner_id
	JOIN partner_referrals pr ON pr.user_id = u.id
	JOIN partners          p  ON p.id = pr.partner_id
	WHERE i.id = $1
	  AND i.status = 'paid'
	  AND i.amount_cents > 0
	  AND COALESCE(i.provider, '') <> 'admin_grant'
	  AND p.status <> 'ended'
	ON CONFLICT DO NOTHING`

// === Notification ===

// CommissionNotice is everything the partner email needs.
type CommissionNotice struct {
	PartnerName     string
	ContactName     string
	ContactEmail    string
	StoreName       string
	Plan            string
	Months          int
	BaseAmountCents int64
	CommissionBps   int
	CommissionCents int64
	// The running total still owed, including this one. The same number the
	// admin page shows, read in the same statement, so the two can never
	// disagree in the partner's inbox.
	TotalOwedCents int64
}

// ClaimCommissionNotice claims the right to tell a partner about one
// commission, and returns what to say.
//
// The guarded UPDATE is the point: a redelivered webhook, or two pods racing,
// produce one claim and one email. Returns nil when there is nothing to send
// — no commission, already notified, or the partner has no contact address.
func (r *PartnerRepo) ClaimCommissionNotice(ctx context.Context, invoiceID uuid.UUID) (*CommissionNotice, error) {
	var n CommissionNotice
	err := r.pool.QueryRow(ctx, `
		WITH claimed AS (
			UPDATE partner_commissions c
			SET notified_at = now()
			WHERE c.invoice_id = $1
			  AND c.notified_at IS NULL
			  AND c.status = 'earned'
			RETURNING c.id, c.partner_id, c.store_name, c.plan, c.months,
			          c.base_amount_cents, c.commission_bps, c.commission_cents
		)
		SELECT p.name, p.contact_name, p.contact_email,
		       cl.store_name, cl.plan, cl.months,
		       cl.base_amount_cents, cl.commission_bps, cl.commission_cents,
		       (SELECT COALESCE(sum(c2.commission_cents), 0)
		          FROM partner_commissions c2
		         WHERE c2.partner_id = p.id AND c2.status = 'earned')
		FROM claimed cl
		JOIN partners p ON p.id = cl.partner_id
		WHERE p.contact_email <> ''
	`, invoiceID).Scan(&n.PartnerName, &n.ContactName, &n.ContactEmail,
		&n.StoreName, &n.Plan, &n.Months,
		&n.BaseAmountCents, &n.CommissionBps, &n.CommissionCents, &n.TotalOwedCents)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &n, nil
}

// === Detail views ===

// ReferredUser is one row of the partner's signup list.
type ReferredUser struct {
	UserID       uuid.UUID
	Name         string
	Email        string
	SignupMethod string
	CreatedAt    time.Time

	StoreName  string
	Subscribed bool
	// Set once they have paid: which plan, and what the partner earned.
	Plan            string
	CommissionCents int64
	PaidAt          *time.Time
}

// ListReferredUsers answers "who did this partner bring, and did they pay".
//
// LEFT JOINs throughout: a referred user who never created a store is still a
// referral worth showing. A partner sending four hundred signups and two
// subscriptions is a different conversation from one sending twenty and
// fifteen, and that conversation needs both numbers.
func (r *PartnerRepo) ListReferredUsers(ctx context.Context, partnerID uuid.UUID, limit, offset int) ([]ReferredUser, int, error) {
	var total int
	if err := r.pool.QueryRow(ctx,
		`SELECT count(*) FROM partner_referrals WHERE partner_id = $1`,
		partnerID).Scan(&total); err != nil {
		return nil, 0, err
	}

	rows, err := r.pool.Query(ctx, `
		SELECT u.id, u.name, u.email, pr.signup_method, pr.created_at,
		       COALESCE(s.name, ''),
		       c.id IS NOT NULL,
		       COALESCE(c.plan, ''), COALESCE(c.commission_cents, 0), c.created_at
		FROM partner_referrals pr
		JOIN users u ON u.id = pr.user_id
		LEFT JOIN stores s ON s.owner_id = u.id
		LEFT JOIN partner_commissions c
		       ON c.referred_user_id = u.id AND c.status <> 'void'
		WHERE pr.partner_id = $1
		ORDER BY pr.created_at DESC
		LIMIT $2 OFFSET $3`, partnerID, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	out := []ReferredUser{}
	for rows.Next() {
		var u ReferredUser
		if err := rows.Scan(&u.UserID, &u.Name, &u.Email, &u.SignupMethod, &u.CreatedAt,
			&u.StoreName, &u.Subscribed, &u.Plan, &u.CommissionCents, &u.PaidAt); err != nil {
			return nil, 0, err
		}
		out = append(out, u)
	}
	return out, total, rows.Err()
}

// Commission is one ledger row as the admin sees it.
type Commission struct {
	ID                uuid.UUID
	ReferredUserEmail string
	StoreName         string
	InvoiceID         uuid.UUID
	Plan              string
	Months            int
	BaseAmountCents   int64
	CommissionBps     int
	CommissionCents   int64
	Status            string
	VoidReason        string
	PayoutRef         string
	PaidOutAt         *time.Time
	CreatedAt         time.Time
}

func (r *PartnerRepo) ListCommissions(ctx context.Context, partnerID uuid.UUID, limit, offset int) ([]Commission, int, error) {
	var total int
	if err := r.pool.QueryRow(ctx,
		`SELECT count(*) FROM partner_commissions WHERE partner_id = $1`,
		partnerID).Scan(&total); err != nil {
		return nil, 0, err
	}

	rows, err := r.pool.Query(ctx, `
		SELECT c.id, c.referred_user_email, c.store_name, c.invoice_id,
		       c.plan, c.months, c.base_amount_cents, c.commission_bps,
		       c.commission_cents, c.status, c.void_reason,
		       COALESCE(po.reference, ''), c.paid_out_at, c.created_at
		FROM partner_commissions c
		LEFT JOIN partner_payouts po ON po.id = c.payout_id
		WHERE c.partner_id = $1
		ORDER BY c.created_at DESC
		LIMIT $2 OFFSET $3`, partnerID, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	out := []Commission{}
	for rows.Next() {
		var c Commission
		if err := rows.Scan(&c.ID, &c.ReferredUserEmail, &c.StoreName, &c.InvoiceID,
			&c.Plan, &c.Months, &c.BaseAmountCents, &c.CommissionBps,
			&c.CommissionCents, &c.Status, &c.VoidReason,
			&c.PayoutRef, &c.PaidOutAt, &c.CreatedAt); err != nil {
			return nil, 0, err
		}
		out = append(out, c)
	}
	return out, total, rows.Err()
}

// Payout is one settled batch.
type Payout struct {
	ID              uuid.UUID
	AmountCents     int64
	CommissionCount int
	Method          string
	Reference       string
	Notes           string
	PaidAt          time.Time
}

func (r *PartnerRepo) ListPayouts(ctx context.Context, partnerID uuid.UUID) ([]Payout, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, amount_cents, commission_count, method, reference, notes, paid_at
		FROM partner_payouts WHERE partner_id = $1
		ORDER BY paid_at DESC LIMIT 100`, partnerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Payout{}
	for rows.Next() {
		var p Payout
		if err := rows.Scan(&p.ID, &p.AmountCents, &p.CommissionCount,
			&p.Method, &p.Reference, &p.Notes, &p.PaidAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// === Payout ===

type RecordPayoutInput struct {
	PartnerID uuid.UUID
	Method    string
	Reference string
	Notes     string
	CreatedBy uuid.UUID
}

// RecordPayout settles every outstanding commission for a partner as one
// batch, and returns it.
//
// The order matters: the commissions are flipped FIRST with a guarded UPDATE,
// and the payout row is written from what actually moved. Doing it the other
// way round — insert the payout, then update — would record a payout for an
// amount the UPDATE might not match, and a double-click would file a second
// payout for zero.
//
// Returns ErrPayoutNothingDue when nothing was outstanding, so a repeated
// click is a no-op rather than an empty receipt.
func (r *PartnerRepo) RecordPayout(ctx context.Context, in RecordPayoutInput) (*Payout, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Lock the partner row so two admins clicking at once serialise here
	// rather than splitting one set of commissions across two payouts.
	var exists bool
	if err := tx.QueryRow(ctx,
		`SELECT true FROM partners WHERE id = $1 FOR UPDATE`, in.PartnerID).Scan(&exists); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrPartnerNotFound
		}
		return nil, err
	}

	var total int64
	var count int
	if err := tx.QueryRow(ctx, `
		SELECT COALESCE(sum(commission_cents), 0), count(*)
		FROM partner_commissions
		WHERE partner_id = $1 AND status = 'earned'`, in.PartnerID).Scan(&total, &count); err != nil {
		return nil, err
	}
	if count == 0 {
		return nil, ErrPayoutNothingDue
	}

	var p Payout
	if err := tx.QueryRow(ctx, `
		INSERT INTO partner_payouts (partner_id, amount_cents, commission_count,
		                             method, reference, notes, created_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, amount_cents, commission_count, method, reference, notes, paid_at`,
		in.PartnerID, total, count, in.Method, in.Reference, in.Notes,
		nullUUID(in.CreatedBy)).
		Scan(&p.ID, &p.AmountCents, &p.CommissionCount, &p.Method,
			&p.Reference, &p.Notes, &p.PaidAt); err != nil {
		return nil, err
	}

	if _, err := tx.Exec(ctx, `
		UPDATE partner_commissions
		SET status = 'paid', payout_id = $2, paid_out_at = now(), updated_at = now()
		WHERE partner_id = $1 AND status = 'earned'`, in.PartnerID, p.ID); err != nil {
		return nil, err
	}

	return &p, tx.Commit(ctx)
}

// VoidCommission reverses an accrual — a refund, or one recorded in error.
//
// Guarded on 'earned': a commission that has already been paid out is not
// something the database can undo, because the money has left. That is a
// conversation, not an UPDATE.
//
// Voiding frees the partial unique index, so the customer's next genuine
// payment accrues again.
func (r *PartnerRepo) VoidCommission(ctx context.Context, id uuid.UUID, reason string) error {
	ct, err := r.pool.Exec(ctx, `
		UPDATE partner_commissions
		SET status = 'void', void_reason = $2, updated_at = now()
		WHERE id = $1 AND status = 'earned'`, id, strings.TrimSpace(reason))
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrCommissionLocked
	}
	return nil
}

// PartnerOfUser names the partner a user belongs to, for the badge on the
// admin user and transaction lists. Empty when unattributed.
func (r *PartnerRepo) PartnerOfUser(ctx context.Context, userID uuid.UUID) (string, error) {
	var name string
	err := r.pool.QueryRow(ctx, `
		SELECT p.name FROM partner_referrals pr
		JOIN partners p ON p.id = pr.partner_id
		WHERE pr.user_id = $1`, userID).Scan(&name)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	return name, err
}
