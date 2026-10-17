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
)

var (
	// ErrPairingCodeInvalid covers unknown, expired, already-redeemed and
	// belongs-to-a-retired-booth in one answer. A tablet that typed the code
	// wrong and a tablet guessing codes get told the same thing.
	ErrPairingCodeInvalid = errors.New("pairing code invalid")
)

// PairingTTL is how long a code stays usable. Long enough to carry the admin
// console from a desk to the booth on the next floor, short enough that a code
// left on a screen overnight is already dead.
const PairingTTL = 15 * time.Minute

// pairingAlphabet omits 0/O/1/I/L. The code is read off one screen and typed
// on another by someone standing up, which is where those pairs cost time.
const pairingAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

// PairingCode is an outstanding invitation for one tablet to become one booth.
type PairingCode struct {
	ID          uuid.UUID
	BoothID     uuid.UUID
	Code        string
	ExpiresAt   time.Time
	RedeemedAt  *time.Time
	DeviceLabel string
	CreatedAt   time.Time
}

// Expired reports whether the code can still be redeemed.
func (c PairingCode) Expired() bool { return time.Now().After(c.ExpiresAt) }

// CreatePairingCode supersedes any outstanding code for the booth and mints a
// new one.
//
// Superseding is the point: an admin who clicks "pair" twice because the first
// code scrolled off screen should end up with one live code, not two. The old
// row is deleted rather than marked, because an unredeemed code carries no
// history worth keeping and holding the code string would block its reuse.
func (r *PhotoBoothRepo) CreatePairingCode(ctx context.Context, boothID uuid.UUID, label string, createdBy uuid.UUID) (*PairingCode, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx,
		`DELETE FROM photobooth_pairing_codes WHERE booth_id = $1 AND redeemed_at IS NULL`,
		boothID); err != nil {
		return nil, err
	}
	// Reap everyone else's dead codes while we hold a transaction open
	// anyway: without this the live-code unique index slowly fills with
	// strings nobody can use.
	if _, err := tx.Exec(ctx,
		`DELETE FROM photobooth_pairing_codes WHERE redeemed_at IS NULL AND expires_at < now()`); err != nil {
		return nil, err
	}

	// Retry on collision rather than pre-checking: the unique index is the
	// authority, and at 31^6 the loop effectively never runs twice.
	for attempt := 0; attempt < 8; attempt++ {
		code, err := generatePairingCode()
		if err != nil {
			return nil, err
		}
		var out PairingCode
		err = tx.QueryRow(ctx, `
			INSERT INTO photobooth_pairing_codes (booth_id, code, expires_at, device_label, created_by)
			VALUES ($1, $2, now() + $3::interval, $4, $5)
			RETURNING id, booth_id, code, expires_at, redeemed_at, device_label, created_at
		`, boothID, code, PairingTTL.String(), label, nullUUID(createdBy)).
			Scan(&out.ID, &out.BoothID, &out.Code, &out.ExpiresAt,
				&out.RedeemedAt, &out.DeviceLabel, &out.CreatedAt)
		if err == nil {
			return &out, tx.Commit(ctx)
		}
		if !isUniqueViolation(err) {
			return nil, err
		}
		// A unique violation aborts the transaction in Postgres, so the
		// retry needs a fresh one.
		_ = tx.Rollback(ctx)
		if tx, err = r.pool.Begin(ctx); err != nil {
			return nil, err
		}
	}
	return nil, errors.New("could not allocate a pairing code")
}

// ActivePairingCodeFor returns the booth's outstanding code, or nil. Expired
// rows are treated as absent so the console never displays a dead code as if
// it were usable.
func (r *PhotoBoothRepo) ActivePairingCodeFor(ctx context.Context, boothID uuid.UUID) (*PairingCode, error) {
	var out PairingCode
	err := r.pool.QueryRow(ctx, `
		SELECT id, booth_id, code, expires_at, redeemed_at, device_label, created_at
		FROM photobooth_pairing_codes
		WHERE booth_id = $1 AND redeemed_at IS NULL AND expires_at > now()
		ORDER BY created_at DESC
		LIMIT 1
	`, boothID).Scan(&out.ID, &out.BoothID, &out.Code, &out.ExpiresAt,
		&out.RedeemedAt, &out.DeviceLabel, &out.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &out, nil
}

// CancelPairingCode withdraws an outstanding invitation. Idempotent: a code
// that was already redeemed or never existed leaves the caller's intent
// satisfied.
func (r *PhotoBoothRepo) CancelPairingCode(ctx context.Context, boothID uuid.UUID) error {
	_, err := r.pool.Exec(ctx,
		`DELETE FROM photobooth_pairing_codes WHERE booth_id = $1 AND redeemed_at IS NULL`,
		boothID)
	return err
}

// RedeemPairingCode trades a code for a real device token, once.
//
// The claim and the issue are one transaction, and the claim is a guarded
// UPDATE in the repo's house style: the WHERE clause re-checks every
// precondition (unredeemed, unexpired, booth still active) inside the
// statement that marks it used. Two tablets racing on the same code therefore
// produce one token and one failure, not two tokens — which would leave a
// stranger's tablet authenticated as a booth that charges real money.
func (r *PhotoBoothRepo) RedeemPairingCode(ctx context.Context, rawCode, deviceLabel string) (raw string, b *Booth, err error) {
	code := normalizePairingCode(rawCode)
	if len(code) != 6 {
		return "", nil, ErrPairingCodeInvalid
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return "", nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var pairingID, boothID uuid.UUID
	var label string
	err = tx.QueryRow(ctx, `
		UPDATE photobooth_pairing_codes p
		SET redeemed_at = now()
		FROM photobooth_booths b
		WHERE p.code = $1
		  AND p.redeemed_at IS NULL
		  AND p.expires_at > now()
		  AND b.id = p.booth_id
		  AND b.status = 'active'
		RETURNING p.id, p.booth_id, p.device_label
	`, code).Scan(&pairingID, &boothID, &label)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil, ErrPairingCodeInvalid
	}
	if err != nil {
		return "", nil, err
	}

	if l := strings.TrimSpace(deviceLabel); l != "" {
		label = l
	}
	if label == "" {
		label = "Tablet booth"
	}

	raw, tok, err := insertDeviceToken(ctx, tx, boothID, label, uuid.Nil)
	if err != nil {
		return "", nil, err
	}
	if _, err := tx.Exec(ctx,
		`UPDATE photobooth_pairing_codes SET redeemed_token_id = $2, device_label = $3 WHERE id = $1`,
		pairingID, tok.ID, label); err != nil {
		return "", nil, err
	}

	booth, err := scanBooth(tx.QueryRow(ctx,
		`SELECT `+boothCols+` FROM photobooth_booths WHERE id = $1`, boothID))
	if err != nil {
		return "", nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return "", nil, err
	}
	return raw, booth, nil
}

// normalizePairingCode forgives only the ways a correct code gets typed:
// lowercase, and the separators someone adds while reading it aloud.
//
// Characters the alphabet deliberately excludes (0/O/1/I/L) are NOT folded to
// a guess. A code containing one was misread, and silently repairing it would
// mean sometimes pairing a tablet against a code the operator never saw.
func normalizePairingCode(in string) string {
	var sb strings.Builder
	for _, r := range strings.ToUpper(strings.TrimSpace(in)) {
		switch r {
		case ' ', '-', '_', '\t', '.':
			continue
		}
		sb.WriteRune(r)
	}
	out := sb.String()
	for _, r := range out {
		if !strings.ContainsRune(pairingAlphabet, r) {
			return ""
		}
	}
	return out
}

func generatePairingCode() (string, error) {
	n := big.NewInt(int64(len(pairingAlphabet)))
	var sb strings.Builder
	for i := 0; i < 6; i++ {
		// crypto/rand with rejection-free modulo via Int: the alphabet is
		// small enough that the biased byte%n shortcut is avoidable for free.
		v, err := rand.Int(rand.Reader, n)
		if err != nil {
			return "", err
		}
		sb.WriteByte(pairingAlphabet[v.Int64()])
	}
	return sb.String(), nil
}
