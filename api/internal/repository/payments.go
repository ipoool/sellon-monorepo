package repository

import (
	"context"
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

func (r *PaymentRepo) Get(ctx context.Context, storeID uuid.UUID, provider string) (*PaymentGateway, error) {
	const q = `
		SELECT id, store_id, provider,
		       server_key_sandbox_encrypted, server_key_prod_encrypted,
		       client_key_sandbox, client_key_prod,
		       is_sandbox, enabled_methods, last_verified_at, last_verify_status, updated_at
		FROM payment_gateway_credentials
		WHERE store_id = $1 AND provider = $2
	`
	var g PaymentGateway
	err := r.pool.QueryRow(ctx, q, storeID, provider).Scan(
		&g.ID, &g.StoreID, &g.Provider,
		&g.ServerKeySandboxEncrypted, &g.ServerKeyProdEncrypted,
		&g.ClientKeySandbox, &g.ClientKeyProd,
		&g.IsSandbox, &g.EnabledMethods, &g.LastVerifiedAt, &g.LastVerifyStatus,
		&g.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrGatewayNotFound
	}
	if err != nil {
		return nil, err
	}
	return &g, nil
}

// SaveGatewayInput supports partial key updates: pass nil for the encrypted
// blob to leave that env's server key untouched. ClientKey* are always set
// (use the existing string to preserve).
type SaveGatewayInput struct {
	StoreID                   uuid.UUID
	Provider                  string
	ServerKeySandboxEncrypted []byte // nil = don't touch
	ServerKeyProdEncrypted    []byte // nil = don't touch
	ClientKeySandbox          string
	ClientKeyProd             string
	IsSandbox                 bool
	EnabledMethods            []string
}

func (r *PaymentRepo) Upsert(ctx context.Context, in SaveGatewayInput) error {
	// Insert with whatever was provided; on conflict, only update server keys
	// if non-nil (preserve previously stored keys when user only edits one env).
	const q = `
		INSERT INTO payment_gateway_credentials
		    (store_id, provider, server_key_sandbox_encrypted, server_key_prod_encrypted,
		     client_key_sandbox, client_key_prod, is_sandbox, enabled_methods)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (store_id, provider) DO UPDATE SET
		    server_key_sandbox_encrypted = COALESCE(EXCLUDED.server_key_sandbox_encrypted, payment_gateway_credentials.server_key_sandbox_encrypted),
		    server_key_prod_encrypted    = COALESCE(EXCLUDED.server_key_prod_encrypted,    payment_gateway_credentials.server_key_prod_encrypted),
		    client_key_sandbox = EXCLUDED.client_key_sandbox,
		    client_key_prod    = EXCLUDED.client_key_prod,
		    is_sandbox     = EXCLUDED.is_sandbox,
		    enabled_methods = EXCLUDED.enabled_methods,
		    updated_at = now()
	`
	_, err := r.pool.Exec(ctx, q,
		in.StoreID, in.Provider,
		in.ServerKeySandboxEncrypted, in.ServerKeyProdEncrypted,
		in.ClientKeySandbox, in.ClientKeyProd,
		in.IsSandbox, in.EnabledMethods,
	)
	return err
}

func (r *PaymentRepo) MarkVerified(ctx context.Context, storeID uuid.UUID, provider, status string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE payment_gateway_credentials
		SET last_verified_at = now(), last_verify_status = $3
		WHERE store_id = $1 AND provider = $2
	`, storeID, provider, status)
	return err
}
