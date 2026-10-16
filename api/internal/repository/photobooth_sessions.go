package repository

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PhotoBoothSessionRepo owns the money path for PhotoBoost.
//
// Every transition that moves money re-checks its precondition inside the same
// statement and reports zero rows as "someone else won the race" — the same
// rule the order and subscription paths follow, for the same reason: an
// unattended booth has nobody to notice a double settle.
type PhotoBoothSessionRepo struct {
	pool *pgxpool.Pool
}

func NewPhotoBoothSessionRepo(pool *pgxpool.Pool) *PhotoBoothSessionRepo {
	return &PhotoBoothSessionRepo{pool: pool}
}

var (
	// ErrSessionNotFound covers unknown and wrong-booth alike.
	ErrSessionNotFound = errors.New("photobooth session not found")
	// ErrSessionNotChargeable means the session is not in a state where a new
	// QRIS charge may be created (already charged, paid, expired, cancelled).
	ErrSessionNotChargeable = errors.New("photobooth session not chargeable")
	// ErrSessionPaymentUnchanged means the settle guard rejected the write:
	// the session is already paid or refunded. Treat as replay — acknowledge,
	// fire no side effects.
	ErrSessionPaymentUnchanged = errors.New("photobooth payment unchanged")
	// ErrSessionNotPaid guards the capture/print endpoints.
	ErrSessionNotPaid = errors.New("photobooth session not paid")
)

type PhotoBoothSession struct {
	ID            uuid.UUID
	BoothID       uuid.UUID
	BoothCode     string
	BoothName     string
	DeviceTokenID *uuid.UUID

	SessionNumber  string
	IdempotencyKey *string

	AmountCents  int64
	ShotsPlanned int
	ShotsTaken   int
	PrintCopies  int
	FrameID      string

	Status        string
	PaymentStatus string

	PaymentProvider       string
	PaymentMethod         string
	ProviderOrderID       *string
	ProviderTransactionID string
	QRString              string
	QRURL                 string
	QRExpiresAt           *time.Time
	ChargePending         bool

	NeedsReview  bool
	ReviewReason string

	RefundedAt        *time.Time
	RefundAmountCents *int64
	RefundReason      string

	ResultURL     string
	AppVersion    string
	FailureReason string

	CreatedAt    time.Time
	ChargedAt    *time.Time
	PaidAt       *time.Time
	CapturedAt   *time.Time
	PrintedAt    *time.Time
	CompletedAt  *time.Time
	ExpiredAt    *time.Time
	ReconciledAt *time.Time
	UpdatedAt    time.Time
}

const sessionCols = `
	id, booth_id, device_token_id, session_number, idempotency_key,
	amount_cents, shots_planned, shots_taken, print_copies, frame_id,
	status, payment_status,
	payment_provider, payment_method, provider_order_id, provider_transaction_id,
	qr_string, qr_url, qr_expires_at, charge_pending,
	needs_review, review_reason,
	refunded_at, refund_amount_cents, refund_reason,
	result_url, app_version, failure_reason,
	created_at, charged_at, paid_at, captured_at, printed_at, completed_at,
	expired_at, reconciled_at, updated_at`

func scanSession(row pgx.Row) (*PhotoBoothSession, error) {
	var s PhotoBoothSession
	if err := row.Scan(
		&s.ID, &s.BoothID, &s.DeviceTokenID, &s.SessionNumber, &s.IdempotencyKey,
		&s.AmountCents, &s.ShotsPlanned, &s.ShotsTaken, &s.PrintCopies, &s.FrameID,
		&s.Status, &s.PaymentStatus,
		&s.PaymentProvider, &s.PaymentMethod, &s.ProviderOrderID, &s.ProviderTransactionID,
		&s.QRString, &s.QRURL, &s.QRExpiresAt, &s.ChargePending,
		&s.NeedsReview, &s.ReviewReason,
		&s.RefundedAt, &s.RefundAmountCents, &s.RefundReason,
		&s.ResultURL, &s.AppVersion, &s.FailureReason,
		&s.CreatedAt, &s.ChargedAt, &s.PaidAt, &s.CapturedAt, &s.PrintedAt,
		&s.CompletedAt, &s.ExpiredAt, &s.ReconciledAt, &s.UpdatedAt,
	); err != nil {
		return nil, err
	}
	return &s, nil
}

// NewSessionNumber builds the id a customer reads off a failed print and
// Midtrans sees as order_id: PB-{CODE}-{YYMMDD}-{6 random}.
//
// The date is Asia/Jakarta, because the only humans who read it are here. The
// random tail is crypto/rand over an unambiguous alphabet (no 0/O/1/I) so it
// survives being read aloud to an operator.
func NewSessionNumber(boothCode string) string {
	const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
	buf := make([]byte, 6)
	_, _ = rand.Read(buf)
	for i := range buf {
		buf[i] = alphabet[int(buf[i])%len(alphabet)]
	}
	day := time.Now().In(jakartaLoc()).Format("060102")
	return fmt.Sprintf("PB-%s-%s-%s", strings.ToUpper(boothCode), day, string(buf))
}

func jakartaLoc() *time.Location {
	loc, err := time.LoadLocation("Asia/Jakarta")
	if err != nil {
		return time.FixedZone("WIB", 7*60*60)
	}
	return loc
}

type CreateSessionInput struct {
	BoothID        uuid.UUID
	BoothCode      string
	DeviceTokenID  uuid.UUID
	IdempotencyKey string
	// Snapshotted from the server-side effective config. Never from the client.
	AmountCents  int64
	ShotsPlanned int
	PrintCopies  int
	FrameID      string
	AppVersion   string
}

// CreateSession mints a session, or returns the existing one when this booth
// has already used that idempotency key.
//
// Replay returns the original row rather than an error: a booth retrying
// through a flaky link needs to converge on one session, not collect failures.
// The caller tells the two apart via `replayed`.
func (r *PhotoBoothSessionRepo) CreateSession(ctx context.Context, in CreateSessionInput) (s *PhotoBoothSession, replayed bool, err error) {
	var idem *string
	if k := strings.TrimSpace(in.IdempotencyKey); k != "" {
		idem = &k
	}

	// Retry on number collision only; the random tail makes it vanishingly
	// unlikely, but "vanishingly" is not "never" across a fleet.
	for attempt := 0; attempt < 3; attempt++ {
		number := NewSessionNumber(in.BoothCode)
		row := r.pool.QueryRow(ctx, `
			INSERT INTO photobooth_sessions
			    (booth_id, device_token_id, session_number, idempotency_key,
			     amount_cents, shots_planned, print_copies, frame_id, app_version)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
			RETURNING `+sessionCols,
			in.BoothID, nullUUID(in.DeviceTokenID), number, idem,
			in.AmountCents, in.ShotsPlanned, in.PrintCopies, in.FrameID, in.AppVersion)
		s, err = scanSession(row)
		if err == nil {
			return s, false, nil
		}
		if !isUniqueViolation(err) {
			return nil, false, err
		}
		// Which unique index fired? If the booth replayed its key, hand back
		// the original session.
		if idem != nil {
			if existing, lookupErr := r.FindByIdempotencyKey(ctx, in.BoothID, *idem); lookupErr == nil {
				return existing, true, nil
			}
		}
		// Otherwise it was a session_number collision — try another.
	}
	return nil, false, fmt.Errorf("gagal membuat sesi: nomor bentrok berulang")
}

func (r *PhotoBoothSessionRepo) FindByIdempotencyKey(ctx context.Context, boothID uuid.UUID, key string) (*PhotoBoothSession, error) {
	s, err := scanSession(r.pool.QueryRow(ctx,
		`SELECT `+sessionCols+` FROM photobooth_sessions
		 WHERE booth_id = $1 AND idempotency_key = $2`, boothID, key))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrSessionNotFound
	}
	return s, err
}

// FindByNumberForBooth scopes the lookup to the authenticated booth, so one
// booth can never read or drive another's session.
func (r *PhotoBoothSessionRepo) FindByNumberForBooth(ctx context.Context, boothID uuid.UUID, number string) (*PhotoBoothSession, error) {
	s, err := scanSession(r.pool.QueryRow(ctx,
		`SELECT `+sessionCols+` FROM photobooth_sessions
		 WHERE booth_id = $1 AND session_number = $2`, boothID, number))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrSessionNotFound
	}
	return s, err
}

// FindByProviderOrderID is the webhook's lookup.
func (r *PhotoBoothSessionRepo) FindByProviderOrderID(ctx context.Context, orderID string) (*PhotoBoothSession, error) {
	s, err := scanSession(r.pool.QueryRow(ctx,
		`SELECT `+sessionCols+` FROM photobooth_sessions WHERE provider_order_id = $1`, orderID))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrSessionNotFound
	}
	return s, err
}

// ClaimForCharge takes the right to call Midtrans, atomically.
//
// The claim exists because the gateway call is not transactional: without it,
// two concurrent charge requests would both pass a snapshot read and both hit
// Midtrans, and the second would be rejected for a reused order_id — after we
// had already shown the customer a QR. Mirrors orders.refund_pending (0098).
func (r *PhotoBoothSessionRepo) ClaimForCharge(ctx context.Context, boothID uuid.UUID, number, providerOrderID string) (*PhotoBoothSession, error) {
	s, err := scanSession(r.pool.QueryRow(ctx, `
		WITH locked AS (
		    SELECT id FROM photobooth_sessions
		    WHERE booth_id = $1 AND session_number = $2
		      AND status = 'created'
		      AND payment_status = 'pending'
		      AND NOT charge_pending
		    FOR UPDATE
		)
		UPDATE photobooth_sessions s
		SET charge_pending = true,
		    status = 'awaiting_payment',
		    provider_order_id = $3,
		    updated_at = now()
		FROM locked l
		WHERE s.id = l.id
		RETURNING `+prefixCols("s", sessionCols),
		boothID, number, providerOrderID))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrSessionNotChargeable
	}
	return s, err
}

// ReleaseChargeClaim undoes ClaimForCharge after Midtrans rejects, so the
// booth can retry instead of being stuck holding a claim forever.
func (r *PhotoBoothSessionRepo) ReleaseChargeClaim(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE photobooth_sessions
		SET charge_pending = false, status = 'created',
		    provider_order_id = NULL, updated_at = now()
		WHERE id = $1 AND charge_pending AND payment_status = 'pending'
	`, id)
	return err
}

type AttachQRISInput struct {
	SessionID     uuid.UUID
	TransactionID string
	QRString      string
	QRURL         string
	ExpiresAt     *time.Time
}

// AttachQRIS persists the charge result and releases the claim.
func (r *PhotoBoothSessionRepo) AttachQRIS(ctx context.Context, in AttachQRISInput) (*PhotoBoothSession, error) {
	s, err := scanSession(r.pool.QueryRow(ctx, `
		UPDATE photobooth_sessions
		SET provider_transaction_id = $2, qr_string = $3, qr_url = $4,
		    qr_expires_at = $5, charge_pending = false,
		    charged_at = COALESCE(charged_at, now()), updated_at = now()
		WHERE id = $1
		RETURNING `+sessionCols,
		in.SessionID, in.TransactionID, in.QRString, in.QRURL, in.ExpiresAt))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrSessionNotFound
	}
	return s, err
}

// SessionPaymentChange is the pre-update snapshot, atomic with the write.
type SessionPaymentChange struct {
	SessionID     uuid.UUID
	BoothID       uuid.UUID
	SessionNumber string
	AmountCents   int64
	PrevStatus    string
	PrevPayment   string
	// WasExpired reports that the booth had already given up on this session
	// when the money landed. The customer paid into a closed session: it
	// settles anyway, but ops must see it.
	WasExpired bool
}

// SetSessionPaidGuarded settles a session exactly once.
//
// 'paid' may overwrite anything except another 'paid' or a 'refunded'.
// 'refunded' is terminal for the same reason it is on orders: a late
// settlement must never flip a refunded session back to paid, which would read
// as revenue and block any further refund.
//
// Both the webhook and the poll-time reconcile call this, so there is exactly
// one settle path and replays from either are inert.
func (r *PhotoBoothSessionRepo) SetSessionPaidGuarded(ctx context.Context, sessionID uuid.UUID, transactionID string) (*SessionPaymentChange, error) {
	var c SessionPaymentChange
	err := r.pool.QueryRow(ctx, `
		WITH locked AS (
		    SELECT id, booth_id, session_number, amount_cents, status, payment_status
		    FROM photobooth_sessions
		    WHERE id = $1 AND payment_status NOT IN ('paid', 'refunded')
		    FOR UPDATE
		), upd AS (
		    UPDATE photobooth_sessions s
		    SET payment_status = 'paid',
		        -- Keep a terminal status terminal: a session that already
		        -- failed or expired must not be dragged back into the funnel,
		        -- but it IS now paid and flagged below.
		        status = CASE WHEN s.status IN ('expired', 'failed') THEN s.status ELSE 'paid' END,
		        provider_transaction_id = COALESCE(NULLIF($2, ''), s.provider_transaction_id),
		        paid_at = COALESCE(s.paid_at, now()),
		        needs_review = CASE WHEN s.status IN ('expired', 'failed') THEN true ELSE s.needs_review END,
		        review_reason = CASE
		            WHEN s.status IN ('expired', 'failed')
		            THEN 'Pembayaran masuk setelah sesi berakhir'
		            ELSE s.review_reason END,
		        updated_at = now()
		    FROM locked l
		    WHERE s.id = l.id
		    RETURNING l.id, l.booth_id, l.session_number, l.amount_cents,
		              l.status AS prev_status, l.payment_status AS prev_payment
		)
		SELECT id, booth_id, session_number, amount_cents, prev_status, prev_payment FROM upd
	`, sessionID, transactionID).
		Scan(&c.SessionID, &c.BoothID, &c.SessionNumber, &c.AmountCents,
			&c.PrevStatus, &c.PrevPayment)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrSessionPaymentUnchanged
	}
	if err != nil {
		return nil, err
	}
	c.WasExpired = c.PrevStatus == "expired" || c.PrevStatus == "failed"
	return &c, nil
}

// SetShotsTaken records capture progress. Monotonic in SQL, so a retried or
// out-of-order report can never walk the counter backwards.
func (r *PhotoBoothSessionRepo) SetShotsTaken(ctx context.Context, boothID uuid.UUID, number string, shots int) (*PhotoBoothSession, error) {
	s, err := scanSession(r.pool.QueryRow(ctx, `
		UPDATE photobooth_sessions
		SET shots_taken = LEAST(GREATEST(shots_taken, $3), shots_planned),
		    status = CASE WHEN status = 'paid' THEN 'capturing' ELSE status END,
		    captured_at = COALESCE(captured_at, now()),
		    updated_at = now()
		WHERE booth_id = $1 AND session_number = $2 AND payment_status = 'paid'
		RETURNING `+sessionCols,
		boothID, number, shots))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrSessionNotPaid
	}
	return s, err
}

type CompleteSessionInput struct {
	BoothID       uuid.UUID
	Number        string
	Succeeded     bool
	FrameID       string
	PrintCopies   int
	ResultURL     string
	FailureReason string
}

// Complete records the outcome of printing.
//
// A failure sets needs_review: the customer paid and walked away with nothing,
// so a human has to decide between a reprint and a refund. That is the whole
// reason the flag exists on this table.
func (r *PhotoBoothSessionRepo) Complete(ctx context.Context, in CompleteSessionInput) (*PhotoBoothSession, error) {
	status := "completed"
	if !in.Succeeded {
		status = "failed"
	}
	s, err := scanSession(r.pool.QueryRow(ctx, `
		UPDATE photobooth_sessions
		SET status = $3,
		    frame_id = COALESCE(NULLIF($4, ''), frame_id),
		    print_copies = COALESCE(NULLIF($5, 0), print_copies),
		    result_url = COALESCE(NULLIF($6, ''), result_url),
		    failure_reason = $7,
		    printed_at = CASE WHEN $3 = 'completed' THEN COALESCE(printed_at, now()) ELSE printed_at END,
		    completed_at = COALESCE(completed_at, now()),
		    needs_review = CASE WHEN $3 = 'failed' THEN true ELSE needs_review END,
		    review_reason = CASE WHEN $3 = 'failed'
		        THEN 'Sudah bayar tapi gagal cetak' ELSE review_reason END,
		    updated_at = now()
		WHERE booth_id = $1 AND session_number = $2
		  AND payment_status = 'paid'
		  AND status IN ('paid', 'capturing', 'printing', 'completed', 'failed')
		RETURNING `+sessionCols,
		in.BoothID, in.Number, status, in.FrameID, in.PrintCopies,
		in.ResultURL, in.FailureReason))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrSessionNotPaid
	}
	return s, err
}

// MarkExpired gives up on an unpaid session. Guarded so a settlement that
// landed a moment earlier is never overwritten.
func (r *PhotoBoothSessionRepo) MarkExpired(ctx context.Context, sessionID uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE photobooth_sessions
		SET status = 'expired', payment_status = 'expired',
		    expired_at = COALESCE(expired_at, now()), charge_pending = false,
		    updated_at = now()
		WHERE id = $1 AND payment_status = 'pending'
	`, sessionID)
	return err
}

// TouchReconciled stamps a reconcile attempt whatever its outcome, so the
// throttle holds even when Midtrans is unreachable.
func (r *PhotoBoothSessionRepo) TouchReconciled(ctx context.Context, sessionID uuid.UUID) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE photobooth_sessions SET reconciled_at = now() WHERE id = $1`, sessionID)
	return err
}

// FlagNeedsReview surfaces a session in the admin tab's "Perlu dicek" filter.
func (r *PhotoBoothSessionRepo) FlagNeedsReview(ctx context.Context, sessionID uuid.UUID, reason string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE photobooth_sessions
		SET needs_review = true, review_reason = $2, updated_at = now()
		WHERE id = $1
	`, sessionID, reason)
	return err
}
