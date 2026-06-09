package repository

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"math/big"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrOTPCooldown = errors.New("kode baru saja dikirim, tunggu sebentar")
	ErrOTPTooMany  = errors.New("terlalu banyak permintaan kode, coba lagi nanti")
	ErrOTPLocked   = errors.New("terlalu banyak percobaan salah, minta kode baru")
	ErrOTPInvalid  = errors.New("kode salah atau sudah kedaluwarsa")
)

const (
	otpTTL            = 10 * time.Minute
	otpResendCooldown = 60 * time.Second
	otpResendWindow   = time.Hour
	otpMaxResend      = 5
	otpMaxAttempts    = 5
	otpExpiryMinutes  = 10 // surfaced to the buyer in the email copy
)

type BuyerOTPRepo struct{ pool *pgxpool.Pool }

func NewBuyerOTPRepo(pool *pgxpool.Pool) *BuyerOTPRepo { return &BuyerOTPRepo{pool: pool} }

func OTPExpiryMinutes() int { return otpExpiryMinutes }

// genOTP returns a 6-digit numeric code from crypto/rand.
func genOTP() (string, error) {
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

// hashOTP salts the code with the token id so a DB dump can't be reversed with a
// plain 6-digit rainbow table.
func hashOTP(tokenID uuid.UUID, code string) string {
	sum := sha256.Sum256([]byte(tokenID.String() + ":" + code))
	return hex.EncodeToString(sum[:])
}

// RequestOTP upserts the OTP row for (token_id, email), enforcing a 60s send
// cooldown + max 5 sends per rolling hour, and returns the plaintext code for
// the caller to email. Returns ErrOTPCooldown / ErrOTPTooMany when rate-limited.
func (r *BuyerOTPRepo) RequestOTP(ctx context.Context, storeID, tokenID uuid.UUID, email string) (string, error) {
	email = strings.ToLower(strings.TrimSpace(email))

	var lastSent *time.Time
	var resend int
	err := r.pool.QueryRow(ctx,
		`SELECT last_sent_at, resend_count FROM buyer_otps WHERE token_id=$1 AND email=$2`,
		tokenID, email).Scan(&lastSent, &resend)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return "", err
	}
	if err == nil && lastSent != nil {
		if time.Since(*lastSent) < otpResendCooldown {
			return "", ErrOTPCooldown
		}
		if time.Since(*lastSent) < otpResendWindow && resend >= otpMaxResend {
			return "", ErrOTPTooMany
		}
	}

	code, err := genOTP()
	if err != nil {
		return "", err
	}
	hash := hashOTP(tokenID, code)
	expires := time.Now().Add(otpTTL)

	if _, err := r.pool.Exec(ctx, `
		INSERT INTO buyer_otps (store_id, token_id, email, code_hash, expires_at,
		                        attempt_count, resend_count, last_sent_at, consumed_at)
		VALUES ($1, $2, $3, $4, $5, 0, 1, now(), NULL)
		ON CONFLICT (token_id, email) DO UPDATE SET
			code_hash    = EXCLUDED.code_hash,
			expires_at   = EXCLUDED.expires_at,
			attempt_count = 0,
			resend_count = CASE
				WHEN buyer_otps.last_sent_at < now() - interval '1 hour' THEN 1
				ELSE buyer_otps.resend_count + 1
			END,
			last_sent_at = now(),
			consumed_at  = NULL
	`, storeID, tokenID, email, hash, expires); err != nil {
		return "", err
	}
	return code, nil
}

// VerifyOTP checks the submitted code; on success it marks the row consumed
// (single-use). Wrong codes bump attempt_count; after otpMaxAttempts the row
// locks until a fresh code is requested.
func (r *BuyerOTPRepo) VerifyOTP(ctx context.Context, tokenID uuid.UUID, email, code string) error {
	email = strings.ToLower(strings.TrimSpace(email))

	var hash string
	var expires time.Time
	var attempts int
	var consumed *time.Time
	err := r.pool.QueryRow(ctx, `
		SELECT code_hash, expires_at, attempt_count, consumed_at
		FROM buyer_otps WHERE token_id=$1 AND email=$2
	`, tokenID, email).Scan(&hash, &expires, &attempts, &consumed)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrOTPInvalid
	}
	if err != nil {
		return err
	}
	if consumed != nil || time.Now().After(expires) {
		return ErrOTPInvalid
	}
	if attempts >= otpMaxAttempts {
		return ErrOTPLocked
	}
	if subtle.ConstantTimeCompare([]byte(hash), []byte(hashOTP(tokenID, code))) != 1 {
		_, _ = r.pool.Exec(ctx,
			`UPDATE buyer_otps SET attempt_count = attempt_count + 1 WHERE token_id=$1 AND email=$2`,
			tokenID, email)
		return ErrOTPInvalid
	}
	_, err = r.pool.Exec(ctx,
		`UPDATE buyer_otps SET consumed_at = now() WHERE token_id=$1 AND email=$2`,
		tokenID, email)
	return err
}
