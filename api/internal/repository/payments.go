package repository

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PaymentGateway struct {
	ID                        uuid.UUID
	StoreID                   uuid.UUID
	Provider                  string
	ServerKeySandboxEncrypted []byte
	ServerKeyProdEncrypted    []byte
	ClientKeySandbox          string
	ClientKeyProd             string
	IsSandbox                 bool
	EnabledMethods            []string
	WebhookToken              string
	LastVerifiedAt            *time.Time
	LastVerifyStatus          string
	UpdatedAt                 time.Time
}

type PaymentRepo struct {
	pool *pgxpool.Pool
}

func NewPaymentRepo(pool *pgxpool.Pool) *PaymentRepo {
	return &PaymentRepo{pool: pool}
}

var ErrGatewayNotFound = errors.New("payment gateway not found")

const fullSelect = `
	SELECT id, store_id, provider,
	       server_key_sandbox_encrypted, server_key_prod_encrypted,
	       client_key_sandbox, client_key_prod,
	       is_sandbox, enabled_methods, webhook_token,
	       last_verified_at, last_verify_status, updated_at
	FROM payment_gateway_credentials
`

func (r *PaymentRepo) Get(ctx context.Context, storeID uuid.UUID, provider string) (*PaymentGateway, error) {
	q := fullSelect + ` WHERE store_id = $1 AND provider = $2`
	var g PaymentGateway
	err := r.pool.QueryRow(ctx, q, storeID, provider).Scan(
		&g.ID, &g.StoreID, &g.Provider,
		&g.ServerKeySandboxEncrypted, &g.ServerKeyProdEncrypted,
		&g.ClientKeySandbox, &g.ClientKeyProd,
		&g.IsSandbox, &g.EnabledMethods, &g.WebhookToken,
		&g.LastVerifiedAt, &g.LastVerifyStatus, &g.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrGatewayNotFound
	}
	if err != nil {
		return nil, err
	}
	return &g, nil
}

// FindByWebhookToken looks up a gateway by its webhook secret. Used by the
// public webhook endpoint to identify which seller's order to update.
func (r *PaymentRepo) FindByWebhookToken(ctx context.Context, token string) (*PaymentGateway, error) {
	q := fullSelect + ` WHERE webhook_token = $1`
	var g PaymentGateway
	err := r.pool.QueryRow(ctx, q, token).Scan(
		&g.ID, &g.StoreID, &g.Provider,
		&g.ServerKeySandboxEncrypted, &g.ServerKeyProdEncrypted,
		&g.ClientKeySandbox, &g.ClientKeyProd,
		&g.IsSandbox, &g.EnabledMethods, &g.WebhookToken,
		&g.LastVerifiedAt, &g.LastVerifyStatus, &g.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrGatewayNotFound
	}
	if err != nil {
		return nil, err
	}
	return &g, nil
}

type SaveGatewayInput struct {
	StoreID                   uuid.UUID
	Provider                  string
	ServerKeySandboxEncrypted []byte
	ServerKeyProdEncrypted    []byte
	ClientKeySandbox          string
	ClientKeyProd             string
	IsSandbox                 bool
	EnabledMethods            []string
}

// Upsert creates or updates a payment gateway config. On first insert, a
// fresh webhook_token is generated; on update the existing token is preserved
// (rotated separately via RotateWebhookToken).
func (r *PaymentRepo) Upsert(ctx context.Context, in SaveGatewayInput) error {
	token, err := generateWebhookToken()
	if err != nil {
		return err
	}
	const q = `
		INSERT INTO payment_gateway_credentials
		    (store_id, provider, server_key_sandbox_encrypted, server_key_prod_encrypted,
		     client_key_sandbox, client_key_prod, is_sandbox, enabled_methods, webhook_token)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		ON CONFLICT (store_id, provider) DO UPDATE SET
		    server_key_sandbox_encrypted = COALESCE(EXCLUDED.server_key_sandbox_encrypted, payment_gateway_credentials.server_key_sandbox_encrypted),
		    server_key_prod_encrypted    = COALESCE(EXCLUDED.server_key_prod_encrypted,    payment_gateway_credentials.server_key_prod_encrypted),
		    client_key_sandbox = EXCLUDED.client_key_sandbox,
		    client_key_prod    = EXCLUDED.client_key_prod,
		    is_sandbox     = EXCLUDED.is_sandbox,
		    enabled_methods = EXCLUDED.enabled_methods,
		    updated_at = now()
	`
	_, err = r.pool.Exec(ctx, q,
		in.StoreID, in.Provider,
		in.ServerKeySandboxEncrypted, in.ServerKeyProdEncrypted,
		in.ClientKeySandbox, in.ClientKeyProd,
		in.IsSandbox, in.EnabledMethods, token,
	)
	return err
}

// RotateWebhookToken regenerates the webhook URL token (e.g. when seller
// suspects compromise). Returns the new token.
func (r *PaymentRepo) RotateWebhookToken(ctx context.Context, storeID uuid.UUID, provider string) (string, error) {
	token, err := generateWebhookToken()
	if err != nil {
		return "", err
	}
	tag, err := r.pool.Exec(ctx, `
		UPDATE payment_gateway_credentials
		SET webhook_token = $3, updated_at = now()
		WHERE store_id = $1 AND provider = $2
	`, storeID, provider, token)
	if err != nil {
		return "", err
	}
	if tag.RowsAffected() == 0 {
		return "", ErrGatewayNotFound
	}
	return token, nil
}

func (r *PaymentRepo) MarkVerified(ctx context.Context, storeID uuid.UUID, provider, status string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE payment_gateway_credentials
		SET last_verified_at = now(), last_verify_status = $3
		WHERE store_id = $1 AND provider = $2
	`, storeID, provider, status)
	return err
}

func generateWebhookToken() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}
