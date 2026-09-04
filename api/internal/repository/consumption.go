package repository

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// consumeRow is the resolved material consumption for one order line.
type consumeRow struct {
	MaterialID    uuid.UUID
	Quantity      int64 // total for the line (per-unit recipe qty × line qty)
	UnitCostCents int64 // snapshot of the material's cost at sale time
}

// optionIDsFromSnaps extracts the chosen option IDs from order-line snapshots.
func optionIDsFromSnaps(snaps []OptionSnapshot) []uuid.UUID {
	out := make([]uuid.UUID, 0, len(snaps))
	for _, s := range snaps {
		if s.OptionID != uuid.Nil {
			out = append(out, s.OptionID)
		}
	}
	return out
}

// resolveConsumptionTx computes material consumption for one order line from
// the product's BASE recipe PLUS the recipes of the selected modifier options,
// multiplied by line quantity. A material appearing in several places is
// summed. Returns an empty slice (not an error) when there's no recipe — a
// config gap must never break checkout.
func resolveConsumptionTx(ctx context.Context, tx pgx.Tx, productID uuid.UUID, optionIDs []uuid.UUID, lineQty int) ([]consumeRow, error) {
	if lineQty <= 0 {
		return nil, nil
	}
	perUnit := map[uuid.UUID]int64{}
	cost := map[uuid.UUID]int64{}

	baseRows, err := tx.Query(ctx, `
		SELECT pri.material_id, pri.quantity, m.cost_cents
		FROM product_recipe_items pri
		JOIN materials m ON m.id = pri.material_id
		WHERE pri.product_id = $1
	`, productID)
	if err != nil {
		return nil, err
	}
	for baseRows.Next() {
		var mid uuid.UUID
		var q, c int64
		if err := baseRows.Scan(&mid, &q, &c); err != nil {
			baseRows.Close()
			return nil, err
		}
		perUnit[mid] += q
		cost[mid] = c
	}
	baseRows.Close()
	if err := baseRows.Err(); err != nil {
		return nil, err
	}

	if len(optionIDs) > 0 {
		optRows, err := tx.Query(ctx, `
			SELECT ori.material_id, ori.quantity, m.cost_cents
			FROM option_recipe_items ori
			JOIN materials m ON m.id = ori.material_id
			WHERE ori.option_id = ANY($1)
		`, optionIDs)
		if err != nil {
			return nil, err
		}
		for optRows.Next() {
			var mid uuid.UUID
			var q, c int64
			if err := optRows.Scan(&mid, &q, &c); err != nil {
				optRows.Close()
				return nil, err
			}
			perUnit[mid] += q
			cost[mid] = c
		}
		optRows.Close()
		if err := optRows.Err(); err != nil {
			return nil, err
		}
	}

	out := make([]consumeRow, 0, len(perUnit))
	for mid, q := range perUnit {
		out = append(out, consumeRow{
			MaterialID:    mid,
			Quantity:      q * int64(lineQty),
			UnitCostCents: cost[mid],
		})
	}
	return out, nil
}

// resolveMaterialConsumeTx builds a single consume row for a material consumed
// directly (no recipe) — used by the take-away packaging line, which consumes
// 1 × lineQty of its linked material. Store-scoped: returns nil (skip) if the
// material doesn't belong to the store, guarding against cross-tenant ids.
func resolveMaterialConsumeTx(ctx context.Context, tx pgx.Tx, storeID, materialID uuid.UUID, lineQty int) (*consumeRow, error) {
	if lineQty <= 0 {
		return nil, nil
	}
	var cost int64
	err := tx.QueryRow(ctx,
		`SELECT cost_cents FROM materials WHERE id = $1 AND store_id = $2`,
		materialID, storeID,
	).Scan(&cost)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &consumeRow{
		MaterialID:    materialID,
		Quantity:      int64(lineQty),
		UnitCostCents: cost,
	}, nil
}

// applyConsumptionTx decrements material stock (SOFT — no guard, may go
// negative) and writes a 'consume' ledger row per material with a cost
// snapshot. Runs inside the caller's order transaction.
func applyConsumptionTx(ctx context.Context, tx pgx.Tx, storeID, orderID, orderItemID uuid.UUID, rows []consumeRow) error {
	for _, c := range rows {
		if c.Quantity <= 0 {
			continue
		}
		if _, err := tx.Exec(ctx, `
			UPDATE materials SET stock = stock - $2, updated_at = now() WHERE id = $1
		`, c.MaterialID, c.Quantity); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO material_movements
			    (store_id, material_id, movement_type, quantity, unit_cost_cents, order_id, order_item_id)
			VALUES ($1, $2, 'consume', $3, $4, $5, $6)
		`, storeID, c.MaterialID, -c.Quantity, c.UnitCostCents, orderID, orderItemID); err != nil {
			return err
		}
	}
	return nil
}

// reverseConsumptionTx undoes every 'consume' movement recorded for an order:
// material stock is restored and a compensating 'restore' ledger row is
// written per consume row (same unit-cost snapshot, positive quantity, linked
// to the same order/item so the ledger nets to zero). Idempotent — consume
// rows that already have a matching restore row are skipped. Runs inside the
// caller's cancel/void/return transaction. Soft like applyConsumptionTx: a
// missing recipe is not an error.
func reverseConsumptionTx(ctx context.Context, tx pgx.Tx, storeID, orderID uuid.UUID) error {
	rows, err := tx.Query(ctx, `
		SELECT c.material_id, -c.quantity, c.unit_cost_cents, c.order_item_id
		FROM material_movements c
		WHERE c.store_id = $1 AND c.order_id = $2 AND c.movement_type = 'consume'
		  AND NOT EXISTS (
		      SELECT 1 FROM material_movements r
		      WHERE r.store_id = c.store_id AND r.order_id = c.order_id
		        AND r.material_id = c.material_id
		        AND r.order_item_id IS NOT DISTINCT FROM c.order_item_id
		        AND r.movement_type = 'restore'
		  )
	`, storeID, orderID)
	if err != nil {
		return err
	}
	type restoreRow struct {
		materialID  uuid.UUID
		qty         int64
		cost        int64
		orderItemID *uuid.UUID
	}
	var todo []restoreRow
	for rows.Next() {
		var r restoreRow
		if err := rows.Scan(&r.materialID, &r.qty, &r.cost, &r.orderItemID); err != nil {
			rows.Close()
			return err
		}
		todo = append(todo, r)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	for _, r := range todo {
		if r.qty <= 0 {
			continue
		}
		if _, err := tx.Exec(ctx, `
			UPDATE materials SET stock = stock + $2, updated_at = now() WHERE id = $1 AND store_id = $3
		`, r.materialID, r.qty, storeID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO material_movements
			    (store_id, material_id, movement_type, quantity, unit_cost_cents, order_id, order_item_id)
			VALUES ($1, $2, 'restore', $3, $4, $5, $6)
		`, storeID, r.materialID, r.qty, r.cost, orderID, r.orderItemID); err != nil {
			return err
		}
	}
	return nil
}
