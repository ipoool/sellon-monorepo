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

const (
	emailVerifyTTL            = 15 * time.Minute
	emailVerifyResendCooldown = 60 * time.Second
	emailVerifyResendWindow   = time.Hour
	emailVerifyMaxResend      = 5
	emailVerifyMaxAttempts    = 5
	EmailVerifyExpiryMinutes  = 15 // surfaced in the email copy
)

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
func (r *EmailVerificationRepo) RequestCode(ctx context.Context, userID uuid.UUID) (string, error) {
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

	if _, err := r.pool.Exec(ctx, `
		INSERT INTO email_verifications (user_id, code_hash, expires_at,
		                                  attempt_count, resend_count, last_sent_at, consumed_at)
		VALUES ($1, $2, $3, 0, 1, now(), NULL)
		ON CONFLICT (user_id) DO UPDATE SET
			code_hash    = EXCLUDED.code_hash,
			expires_at   = EXCLUDED.expires_at,
			attempt_count = 0,
			resend_count = CASE
				WHEN email_verifications.last_sent_at < now() - interval '1 hour' THEN 1
				ELSE email_verifications.resend_count + 1
			END,
			last_sent_at = now(),
			consumed_at  = NULL
	`, userID, hash, expires); err != nil {
		return "", err
	}
	return code, nil
}

// VerifyCode checks the submitted code; on success marks the row consumed.
// Wrong codes bump attempt_count; after emailVerifyMaxAttempts the row locks
// until a fresh code is requested.
func (r *EmailVerificationRepo) VerifyCode(ctx context.Context, userID uuid.UUID, code string) error {
	var hash string
	var expires time.Time
	var attempts int
	var consumed *time.Time
	err := r.pool.QueryRow(ctx, `
		SELECT code_hash, expires_at, attempt_count, consumed_at
		FROM email_verifications WHERE user_id=$1
	`, userID).Scan(&hash, &expires, &attempts, &consumed)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrVerificationInvalid
	}
	if err != nil {
		return err
	}
	if consumed != nil || time.Now().After(expires) {
		return ErrVerificationInvalid
	}
	if attempts >= emailVerifyMaxAttempts {
		return ErrVerificationLocked
	}
	if subtle.ConstantTimeCompare([]byte(hash), []byte(hashVerifyCode(userID, code))) != 1 {
		_, _ = r.pool.Exec(ctx,
			`UPDATE email_verifications SET attempt_count = attempt_count + 1 WHERE user_id=$1`,
			userID)
		return ErrVerificationInvalid
	}
	_, err = r.pool.Exec(ctx,
		`UPDATE email_verifications SET consumed_at = now() WHERE user_id=$1`,
		userID)
	return err
}
