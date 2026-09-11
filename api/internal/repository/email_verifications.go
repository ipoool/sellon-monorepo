package repository

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"math/big"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrVerificationCooldown = errors.New("kode baru saja dikirim, tunggu sebentar")
	ErrVerificationTooMany  = errors.New("terlalu banyak permintaan kode, coba lagi nanti")
	ErrVerificationLocked   = errors.New("terlalu banyak percobaan salah, minta kode baru")
	ErrVerificationInvalid  = errors.New("kode salah atau sudah kedaluwarsa")
)

// VerificationPurpose distinguishes the two flows that share the
// email_verifications table. A code minted for one purpose can never be
// consumed by the other endpoint.
type VerificationPurpose string

const (
	PurposeVerifyEmail   VerificationPurpose = "verify"
	PurposeResetPassword VerificationPurpose = "reset"
)

const (
	emailVerifyTTL            = 15 * time.Minute
	emailVerifyResendCooldown = 60 * time.Second
	emailVerifyResendWindow   = time.Hour
	emailVerifyMaxResend      = 5
	emailVerifyMaxAttempts    = 5
	EmailVerifyExpiryMinutes  = 15 // surfaced in the email copy
)

// PendingClaim is the password (+ optional name) a caller submitted at
// register time for an account that already existed. It is parked on the
// verification row and only applied to the user once the email owner
// enters the code — see the migration 0097 comment for the takeover this
// prevents.
type PendingClaim struct {
	PasswordHash string
	Name         string
}

type EmailVerificationRepo struct{ pool *pgxpool.Pool }

func NewEmailVerificationRepo(pool *pgxpool.Pool) *EmailVerificationRepo {
	return &EmailVerificationRepo{pool: pool}
}

func genVerifyCode() (string, error) {
	const digits = "0123456789"
	b := make([]byte, 6)
	for i := range b {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(digits))))
		if err != nil {
			return "", err
		}
		b[i] = digits[n.Int64()]
	}
	return string(b), nil
}

// hashVerifyCode salts with the user id so a DB dump can't be reversed with a
// plain 6-digit rainbow table.
func hashVerifyCode(userID uuid.UUID, code string) string {
	sum := sha256.Sum256([]byte(userID.String() + ":" + code))
	return hex.EncodeToString(sum[:])
}

// RequestCode upserts the verification row for userID, enforcing a 60s send
// cooldown + max 5 sends/hour, and returns the plaintext code to email.
//
// pending (may be nil) is the register-claim payload. When nil and the row's
// purpose is unchanged, an existing pending claim is preserved so a
// login-triggered resend doesn't wipe the password the email owner is in
// the middle of proving. Switching purpose always clears it.
//
// A LIVE claim (same purpose, unconsumed, unexpired, non-empty hash) is never
// replaced, even by a caller supplying a new one. Without that hold, anyone
// could POST /auth/register for a stranger's address on repeat: each call
// overwrote the parked password with one of the attacker's choosing, so the
// real owner — who receives every code, since the mail goes to their mailbox —
// could never finish their own signup, because the password they type no
// longer matches the hash parked for them. The hold makes a re-claim a plain
// code resend instead: the owner still gets a working code, and the first
// claim stands.
//
// The hold is bounded by the claim's own 15-minute TTL and by the existing
// 5-sends-per-hour quota above (each allowed send extends the live claim), so
// a squatter who claims an address first cannot sit on it indefinitely — the
// real owner re-registers once the claim lapses and their password wins, as
// migration 0097 intends. Callers must not vary their response on this: the
// endpoint would otherwise become an account-existence oracle.
func (r *EmailVerificationRepo) RequestCode(ctx context.Context, userID uuid.UUID, purpose VerificationPurpose, pending *PendingClaim) (string, error) {
	var lastSent *time.Time
	var resend int
	err := r.pool.QueryRow(ctx,
		`SELECT last_sent_at, resend_count FROM email_verifications WHERE user_id=$1`,
		userID).Scan(&lastSent, &resend)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return "", err
	}
	if err == nil && lastSent != nil {
		if time.Since(*lastSent) < emailVerifyResendCooldown {
			return "", ErrVerificationCooldown
		}
		if time.Since(*lastSent) < emailVerifyResendWindow && resend >= emailVerifyMaxResend {
			return "", ErrVerificationTooMany
		}
	}

	code, err := genVerifyCode()
	if err != nil {
		return "", err
	}
	hash := hashVerifyCode(userID, code)
	expires := time.Now().Add(emailVerifyTTL)

	pendingHash, pendingName := "", ""
	if pending != nil {
		pendingHash, pendingName = pending.PasswordHash, pending.Name
	}

	if _, err := r.pool.Exec(ctx, `
		INSERT INTO email_verifications (user_id, code_hash, expires_at, purpose,
		                                  pending_password_hash, pending_name,
		                                  attempt_count, resend_count, last_sent_at, consumed_at)
		VALUES ($1, $2, $3, $4, $5, $6, 0, 1, now(), NULL)
		ON CONFLICT (user_id) DO UPDATE SET
			code_hash    = EXCLUDED.code_hash,
			expires_at   = EXCLUDED.expires_at,
			purpose      = EXCLUDED.purpose,
			-- The first branch is the anti-griefing hold: a live claim wins over
			-- an incoming one. Evaluated against the pre-UPDATE row, so it is
			-- race-free even when two registers land at once.
			pending_password_hash = CASE
				WHEN email_verifications.purpose = EXCLUDED.purpose
				     AND email_verifications.consumed_at IS NULL
				     AND email_verifications.expires_at > now()
				     AND email_verifications.pending_password_hash <> ''
					THEN email_verifications.pending_password_hash
				WHEN EXCLUDED.pending_password_hash <> '' THEN EXCLUDED.pending_password_hash
				WHEN email_verifications.purpose = EXCLUDED.purpose THEN email_verifications.pending_password_hash
				ELSE ''
			END,
			pending_name = CASE
				WHEN email_verifications.purpose = EXCLUDED.purpose
				     AND email_verifications.consumed_at IS NULL
				     AND email_verifications.expires_at > now()
				     AND email_verifications.pending_password_hash <> ''
					THEN email_verifications.pending_name
				WHEN EXCLUDED.pending_password_hash <> '' THEN EXCLUDED.pending_name
				WHEN email_verifications.purpose = EXCLUDED.purpose THEN email_verifications.pending_name
				ELSE ''
			END,
			attempt_count = 0,
			resend_count = CASE
				WHEN email_verifications.last_sent_at < now() - interval '1 hour' THEN 1
				ELSE email_verifications.resend_count + 1
			END,
			last_sent_at = now(),
			consumed_at  = NULL
	`, userID, hash, expires, string(purpose), pendingHash, pendingName); err != nil {
		return "", err
	}
	return code, nil
}

// Consume validates a submitted code for the given purpose and, on success,
// runs apply in a transaction that also marks the row consumed.
//
// The attempt counter is bumped atomically by the same UPDATE that selects
// the row, so concurrent guesses can't slip past the 5-attempt lock the way a
// read-then-write would allow.
//
// That bump runs on its OWN connection and is committed before the code is
// compared or apply runs. It used to share a transaction with apply, which
// meant any apply failure rolled the counter back: VerifyEmail's apply
// rejects a password that doesn't match the parked claim, so a caller
// holding a code could guess the registrant's password without limit while
// the code stayed alive and the counter stayed at zero.
//
// Counting an attempt that a transient DB error later wasted is the safe
// default. A legitimate user loses one of five tries and can always ask for
// a fresh code; an uncounted attempt is an unbounded oracle with no recovery
// path. The code itself is NOT burned when apply fails — that half stays
// inside the transaction and rolls back — so a genuine blip costs an attempt,
// not the whole verification.
func (r *EmailVerificationRepo) Consume(
	ctx context.Context,
	userID uuid.UUID,
	purpose VerificationPurpose,
	code string,
	apply func(ctx context.Context, tx pgx.Tx, claim PendingClaim) error,
) error {
	var hash string
	var claim PendingClaim
	err := r.pool.QueryRow(ctx, `
		UPDATE email_verifications
		SET attempt_count = attempt_count + 1
		WHERE user_id = $1 AND purpose = $2
		  AND consumed_at IS NULL AND expires_at > now()
		  AND attempt_count < $3
		RETURNING code_hash, pending_password_hash, pending_name
	`, userID, string(purpose), emailVerifyMaxAttempts).Scan(&hash, &claim.PasswordHash, &claim.Name)
	if errors.Is(err, pgx.ErrNoRows) {
		// Distinguish "locked" from "invalid/expired/consumed" for the copy.
		var attempts int
		var consumed *time.Time
		var expires time.Time
		var rowPurpose string
		if e := r.pool.QueryRow(ctx,
			`SELECT attempt_count, consumed_at, expires_at, purpose FROM email_verifications WHERE user_id=$1`,
			userID).Scan(&attempts, &consumed, &expires, &rowPurpose); e == nil &&
			rowPurpose == string(purpose) && consumed == nil && time.Now().Before(expires) &&
			attempts >= emailVerifyMaxAttempts {
			return ErrVerificationLocked
		}
		return ErrVerificationInvalid
	}
	if err != nil {
		return err
	}

	if subtle.ConstantTimeCompare([]byte(hash), []byte(hashVerifyCode(userID, code))) != 1 {
		return ErrVerificationInvalid
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	if apply != nil {
		// Rolls back on failure, so the code survives a transient error —
		// but the attempt above is already durable and cannot be replayed.
		if err := apply(ctx, tx, claim); err != nil {
			return err
		}
	}
	tag, err := tx.Exec(ctx,
		`UPDATE email_verifications SET consumed_at = now(), pending_password_hash = '', pending_name = ''
		 WHERE user_id=$1 AND consumed_at IS NULL`,
		userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrVerificationInvalid
	}
	return tx.Commit(ctx)
}

// PendingClaim returns the password/name parked by Register for this user, if
// a live (unconsumed, unexpired) code of the given purpose is outstanding.
// Read-only: it does NOT touch attempt_count, so it is safe to call from the
// login path where no code is being guessed.
func (r *EmailVerificationRepo) PendingClaim(ctx context.Context, userID uuid.UUID, purpose VerificationPurpose) (PendingClaim, bool, error) {
	var c PendingClaim
	err := r.pool.QueryRow(ctx, `
		SELECT pending_password_hash, pending_name
		FROM email_verifications
		WHERE user_id = $1 AND purpose = $2
		  AND consumed_at IS NULL AND expires_at > now()
	`, userID, string(purpose)).Scan(&c.PasswordHash, &c.Name)
	if errors.Is(err, pgx.ErrNoRows) {
		return c, false, nil
	}
	if err != nil {
		return c, false, err
	}
	return c, c.PasswordHash != "", nil
}
