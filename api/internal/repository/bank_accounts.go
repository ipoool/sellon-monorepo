package repository

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type BankAccount struct {
	ID         uuid.UUID
	StoreID    uuid.UUID
	BankName   string
	HolderName string
	AccountNo  string
	IsPrimary  bool
	QRISURL    string
	CreatedAt  time.Time
}

type BankAccountRepo struct {
	pool *pgxpool.Pool
}

func NewBankAccountRepo(pool *pgxpool.Pool) *BankAccountRepo {
	return &BankAccountRepo{pool: pool}
}

var ErrBankAccountNotFound = errors.New("bank account not found")

func (r *BankAccountRepo) ListByStore(ctx context.Context, storeID uuid.UUID) ([]BankAccount, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, store_id, bank_name, holder_name, account_no, is_primary, qris_url, created_at
		FROM bank_accounts
		WHERE store_id = $1
		ORDER BY is_primary DESC, created_at ASC
	`, storeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []BankAccount
	for rows.Next() {
		var a BankAccount
		if err := rows.Scan(
			&a.ID, &a.StoreID, &a.BankName, &a.HolderName, &a.AccountNo,
			&a.IsPrimary, &a.QRISURL, &a.CreatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

type SaveBankAccountInput struct {
	StoreID    uuid.UUID
	BankName   string
	HolderName string
	AccountNo  string
	IsPrimary  bool
	QRISURL    string
}

func (r *BankAccountRepo) Create(ctx context.Context, in SaveBankAccountInput) (*BankAccount, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	if in.IsPrimary {
		if _, err := tx.Exec(ctx,
			`UPDATE bank_accounts SET is_primary = false WHERE store_id = $1`,
			in.StoreID,
		); err != nil {
			return nil, err
		}
	}

	var a BankAccount
	if err := tx.QueryRow(ctx, `
		INSERT INTO bank_accounts (store_id, bank_name, holder_name, account_no, is_primary, qris_url)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, store_id, bank_name, holder_name, account_no, is_primary, qris_url, created_at
	`, in.StoreID, in.BankName, in.HolderName, in.AccountNo, in.IsPrimary, in.QRISURL).Scan(
		&a.ID, &a.StoreID, &a.BankName, &a.HolderName, &a.AccountNo,
		&a.IsPrimary, &a.QRISURL, &a.CreatedAt,
	); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &a, nil
}

func (r *BankAccountRepo) Update(ctx context.Context, storeID, id uuid.UUID, in SaveBankAccountInput) error {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if in.IsPrimary {
		if _, err := tx.Exec(ctx,
			`UPDATE bank_accounts SET is_primary = false WHERE store_id = $1 AND id != $2`,
			storeID, id,
		); err != nil {
			return err
		}
	}

	tag, err := tx.Exec(ctx, `
		UPDATE bank_accounts
		SET bank_name = $3, holder_name = $4, account_no = $5,
		    is_primary = $6, qris_url = $7
		WHERE id = $1 AND store_id = $2
	`, id, storeID, in.BankName, in.HolderName, in.AccountNo, in.IsPrimary, in.QRISURL)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrBankAccountNotFound
	}
	return tx.Commit(ctx)
}

func (r *BankAccountRepo) Delete(ctx context.Context, storeID, id uuid.UUID) error {
	tag, err := r.pool.Exec(ctx,
		`DELETE FROM bank_accounts WHERE id = $1 AND store_id = $2`,
		id, storeID,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrBankAccountNotFound
	}
	return nil
}
