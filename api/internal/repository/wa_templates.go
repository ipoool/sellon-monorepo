package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type WATemplate struct {
	Key  string
	Body string
}

type WATemplateRepo struct {
	pool *pgxpool.Pool
}

func NewWATemplateRepo(pool *pgxpool.Pool) *WATemplateRepo {
	return &WATemplateRepo{pool: pool}
}

func (r *WATemplateRepo) ListByStore(ctx context.Context, storeID uuid.UUID) (map[string]string, error) {
	rows, err := r.pool.Query(ctx,
		"SELECT template_key, body FROM whatsapp_templates WHERE store_id = $1",
		storeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var k, b string
		if err := rows.Scan(&k, &b); err != nil {
			return nil, err
		}
		out[k] = b
	}
	return out, rows.Err()
}

func (r *WATemplateRepo) Upsert(ctx context.Context, storeID uuid.UUID, key, body string) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO whatsapp_templates (store_id, template_key, body)
		VALUES ($1, $2, $3)
		ON CONFLICT (store_id, template_key) DO UPDATE SET
		    body = EXCLUDED.body, updated_at = now()
	`, storeID, key, body)
	return err
}
