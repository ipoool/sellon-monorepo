package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// BillingSettingsRepo owns the one row that says where a seller sends
// their subscription payment.
//
// Manual bank transfer is the only way to pay for a subscription, so this
// account number is what a seller types into their banking app. It used
// to be a constant in the web bundle; it is a row now so correcting it is
// an edit, not a deploy.
type BillingSettingsRepo struct {
	pool *pgxpool.Pool
}

func NewBillingSettingsRepo(pool *pgxpool.Pool) *BillingSettingsRepo {
	return &BillingSettingsRepo{pool: pool}
}

// BillingSettings is the payment destination shown to sellers.
type BillingSettings struct {
	BankName        string
	AccountNumber   string
	AccountName     string
	SupportWhatsApp string
	Note            string
	UpdatedAt       time.Time
}

// Get reads the singleton. The migration seeds it, so a missing row means
// something is badly wrong — but an empty struct still renders a usable
// screen (the seller falls back to WhatsApp), which beats a 500 on the
// subscription page.
func (r *BillingSettingsRepo) Get(ctx context.Context) (BillingSettings, error) {
	var s BillingSettings
	err := r.pool.QueryRow(ctx, `
		SELECT bank_name, account_number, account_name,
		       support_whatsapp, note, updated_at
		FROM billing_settings WHERE id = true`,
	).Scan(&s.BankName, &s.AccountNumber, &s.AccountName,
		&s.SupportWhatsApp, &s.Note, &s.UpdatedAt)
	return s, err
}

// Update replaces every field and records who did it. Upserts rather than
// updates so a database whose seed never ran still ends up with one row
// instead of silently accepting a write that changed nothing.
func (r *BillingSettingsRepo) Update(
	ctx context.Context, s BillingSettings, by uuid.UUID,
) (BillingSettings, error) {
	var out BillingSettings
	err := r.pool.QueryRow(ctx, `
		INSERT INTO billing_settings
		    (id, bank_name, account_number, account_name,
		     support_whatsapp, note, updated_by, updated_at)
		VALUES (true, $1, $2, $3, $4, $5, $6, now())
		ON CONFLICT (id) DO UPDATE SET
		    bank_name        = EXCLUDED.bank_name,
		    account_number   = EXCLUDED.account_number,
		    account_name     = EXCLUDED.account_name,
		    support_whatsapp = EXCLUDED.support_whatsapp,
		    note             = EXCLUDED.note,
		    updated_by       = EXCLUDED.updated_by,
		    updated_at       = now()
		RETURNING bank_name, account_number, account_name,
		          support_whatsapp, note, updated_at`,
		s.BankName, s.AccountNumber, s.AccountName,
		s.SupportWhatsApp, s.Note, by,
	).Scan(&out.BankName, &out.AccountNumber, &out.AccountName,
		&out.SupportWhatsApp, &out.Note, &out.UpdatedAt)
	return out, err
}
