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
	ID                 uuid.UUID
	StoreID            uuid.UUID
	Provider           string
	ServerKeyEncrypted []byte
	ClientKey          string
	IsSandbox          bool
	EnabledMethods     []string
	LastVerifiedAt     *time.Time
	LastVerifyStatus   string
	UpdatedAt          time.Time
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
		SELECT id, store_id, provider, server_key_encrypted, client_key, is_sandbox,
		       enabled_methods, last_verified_at, last_verify_status, updated_at
		FROM payment_gateway_credentials
		WHERE store_id = $1 AND provider = $2
	`
	var g PaymentGateway
	err := r.pool.QueryRow(ctx, q, storeID, provider).Scan(
		&g.ID, &g.StoreID, &g.Provider, &g.ServerKeyEncrypted, &g.ClientKey,
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

type SaveGatewayInput struct {
	StoreID            uuid.UUID
	Provider           string
	ServerKeyEncrypted []byte
	ClientKey          string
	IsSandbox          bool
	EnabledMethods     []string
}

func (r *PaymentRepo) Upsert(ctx context.Context, in SaveGatewayInput) error {
	const q = `
		INSERT INTO payment_gateway_credentials
		    (store_id, provider, server_key_encrypted, client_key, is_sandbox, enabled_methods)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (store_id, provider) DO UPDATE SET
		    server_key_encrypted = EXCLUDED.server_key_encrypted,
		    client_key = EXCLUDED.client_key,
		    is_sandbox = EXCLUDED.is_sandbox,
		    enabled_methods = EXCLUDED.enabled_methods,
		    updated_at = now()
	`
	_, err := r.pool.Exec(ctx, q,
		in.StoreID, in.Provider, in.ServerKeyEncrypted, in.ClientKey,
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
