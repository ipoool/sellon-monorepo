package repository

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// RecipeItem is one material consumption line (input from the seller).
type RecipeItem struct {
	MaterialID uuid.UUID
	Quantity   int64
}

// RecipeItemDetail enriches a recipe line with material display info for read.
type RecipeItemDetail struct {
	MaterialID   uuid.UUID
	MaterialName string
	BaseUnit     string
	Quantity     int64
}

// ModifierRepo owns product modifier groups/options + recipe links. Sprint 2
// implements the BASE product recipe; groups/options arrive in later sprints.
type ModifierRepo struct {
	pool *pgxpool.Pool
}

func NewModifierRepo(pool *pgxpool.Pool) *ModifierRepo {
	return &ModifierRepo{pool: pool}
}

// GetBaseRecipe returns the product's base recipe with material names/units.
func (r *ModifierRepo) GetBaseRecipe(ctx context.Context, productID uuid.UUID) ([]RecipeItemDetail, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT pri.material_id, m.name, m.base_unit, pri.quantity
		FROM product_recipe_items pri
		JOIN materials m ON m.id = pri.material_id
		WHERE pri.product_id = $1
		ORDER BY m.name
	`, productID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []RecipeItemDetail
	for rows.Next() {
		var d RecipeItemDetail
		if err := rows.Scan(&d.MaterialID, &d.MaterialName, &d.BaseUnit, &d.Quantity); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// === Modifier groups + options ===

type ModifierOption struct {
	ID              uuid.UUID
	Name            string
	PriceDeltaCents int64
	SortOrder       int
	Recipe          []RecipeItemDetail // materials consumed when this option is chosen
}

type ModifierGroup struct {
	ID         uuid.UUID
	Name       string
	Selection  string // "single" | "multi"
	IsRequired bool
	SortOrder  int
	Options    []ModifierOption
}

type ModifierGroupInput struct {
	Name       string
	Selection  string
	IsRequired bool
	SortOrder  int
	Options    []ModifierOptionInput
}

type ModifierOptionInput struct {
	Name            string
	PriceDeltaCents int64
	SortOrder       int
	Recipe          []RecipeItem
}

// OptionSnapshot is a chosen option captured for an order line.
type OptionSnapshot struct {
	OptionID        uuid.UUID
	GroupName       string
	OptionName      string
	PriceDeltaCents int64
}

// GetForProduct loads a product's modifier groups + their options (2 queries,
// assembled in Go). Groups/options sorted by sort_order then name.
func (r *ModifierRepo) GetForProduct(ctx context.Context, productID uuid.UUID) ([]ModifierGroup, error) {
	groupRows, err := r.pool.Query(ctx, `
		SELECT id, name, selection, is_required, sort_order
		FROM product_modifier_groups
		WHERE product_id = $1
		ORDER BY sort_order, name
	`, productID)
	if err != nil {
		return nil, err
	}
	defer groupRows.Close()
	var groups []ModifierGroup
	idx := map[uuid.UUID]int{}
	var ids []uuid.UUID
	for groupRows.Next() {
		var g ModifierGroup
		if err := groupRows.Scan(&g.ID, &g.Name, &g.Selection, &g.IsRequired, &g.SortOrder); err != nil {
			return nil, err
		}
		idx[g.ID] = len(groups)
		ids = append(ids, g.ID)
		groups = append(groups, g)
	}
	if err := groupRows.Err(); err != nil {
		return nil, err
	}
	if len(ids) == 0 {
		return groups, nil
	}
	optRows, err := r.pool.Query(ctx, `
		SELECT id, group_id, name, price_delta_cents, sort_order
		FROM product_modifier_options
		WHERE group_id = ANY($1)
		ORDER BY sort_order, name
	`, ids)
	if err != nil {
		return nil, err
	}
	defer optRows.Close()
	// Track option location (groupIdx, optIdx) so recipes can be attached.
	type oloc struct{ gi, oi int }
	optLoc := map[uuid.UUID]oloc{}
	var optionIDs []uuid.UUID
	for optRows.Next() {
		var o ModifierOption
		var gid uuid.UUID
		if err := optRows.Scan(&o.ID, &gid, &o.Name, &o.PriceDeltaCents, &o.SortOrder); err != nil {
			return nil, err
		}
		if i, ok := idx[gid]; ok {
			groups[i].Options = append(groups[i].Options, o)
			optLoc[o.ID] = oloc{gi: i, oi: len(groups[i].Options) - 1}
			optionIDs = append(optionIDs, o.ID)
		}
	}
	if err := optRows.Err(); err != nil {
		return nil, err
	}
	if len(optionIDs) == 0 {
		return groups, nil
	}
	// Attach per-option recipes (with material names for the editor).
	recRows, err := r.pool.Query(ctx, `
		SELECT ori.option_id, ori.material_id, m.name, m.base_unit, ori.quantity
		FROM option_recipe_items ori
		JOIN materials m ON m.id = ori.material_id
		WHERE ori.option_id = ANY($1)
		ORDER BY m.name
	`, optionIDs)
	if err != nil {
		return nil, err
	}
	defer recRows.Close()
	for recRows.Next() {
		var oid uuid.UUID
		var d RecipeItemDetail
		if err := recRows.Scan(&oid, &d.MaterialID, &d.MaterialName, &d.BaseUnit, &d.Quantity); err != nil {
			return nil, err
		}
		if l, ok := optLoc[oid]; ok {
			groups[l.gi].Options[l.oi].Recipe = append(groups[l.gi].Options[l.oi].Recipe, d)
		}
	}
	return groups, recRows.Err()
}

// GetForProducts batch-loads modifier groups + options for many products in 2
// queries (groups by product_id=ANY, options by group_id=ANY). Used by the
// product list so POS can render option pickers without N+1.
func (r *ModifierRepo) GetForProducts(ctx context.Context, productIDs []uuid.UUID) (map[uuid.UUID][]ModifierGroup, error) {
	out := map[uuid.UUID][]ModifierGroup{}
	if len(productIDs) == 0 {
		return out, nil
	}
	groupRows, err := r.pool.Query(ctx, `
		SELECT id, product_id, name, selection, is_required, sort_order
		FROM product_modifier_groups
		WHERE product_id = ANY($1)
		ORDER BY sort_order, name
	`, productIDs)
	if err != nil {
		return nil, err
	}
	defer groupRows.Close()
	type loc struct {
		productID uuid.UUID
		idx       int
	}
	gloc := map[uuid.UUID]loc{}
	var groupIDs []uuid.UUID
	for groupRows.Next() {
		var g ModifierGroup
		var pid uuid.UUID
		if err := groupRows.Scan(&g.ID, &pid, &g.Name, &g.Selection, &g.IsRequired, &g.SortOrder); err != nil {
			return nil, err
		}
		out[pid] = append(out[pid], g)
		gloc[g.ID] = loc{productID: pid, idx: len(out[pid]) - 1}
		groupIDs = append(groupIDs, g.ID)
	}
	if err := groupRows.Err(); err != nil {
		return nil, err
	}
	if len(groupIDs) == 0 {
		return out, nil
	}
	optRows, err := r.pool.Query(ctx, `
		SELECT id, group_id, name, price_delta_cents, sort_order
		FROM product_modifier_options
		WHERE group_id = ANY($1)
		ORDER BY sort_order, name
	`, groupIDs)
	if err != nil {
		return nil, err
	}
	defer optRows.Close()
	for optRows.Next() {
		var o ModifierOption
		var gid uuid.UUID
		if err := optRows.Scan(&o.ID, &gid, &o.Name, &o.PriceDeltaCents, &o.SortOrder); err != nil {
			return nil, err
		}
		if l, ok := gloc[gid]; ok {
			out[l.productID][l.idx].Options = append(out[l.productID][l.idx].Options, o)
		}
	}
	return out, optRows.Err()
}

// ReplaceModifierGroups nukes a product's groups (cascade options) and inserts
// the new set. storeID is accepted for symmetry/ownership context; the product
// is already verified by the caller.
func (r *ModifierRepo) ReplaceModifierGroups(ctx context.Context, storeID, productID uuid.UUID, groups []ModifierGroupInput) error {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `DELETE FROM product_modifier_groups WHERE product_id = $1`, productID); err != nil {
		return err
	}
	for gi, g := range groups {
		name := strings.TrimSpace(g.Name)
		if name == "" || len(g.Options) == 0 {
			continue
		}
		sel := g.Selection
		if sel != "multi" {
			sel = "single"
		}
		var groupID uuid.UUID
		if err := tx.QueryRow(ctx, `
			INSERT INTO product_modifier_groups (product_id, name, selection, is_required, sort_order)
			VALUES ($1, $2, $3, $4, $5) RETURNING id
		`, productID, name, sel, g.IsRequired, gi).Scan(&groupID); err != nil {
			return err
		}
		for oi, o := range g.Options {
			oname := strings.TrimSpace(o.Name)
			if oname == "" {
				continue
			}
			var optionID uuid.UUID
			if err := tx.QueryRow(ctx, `
				INSERT INTO product_modifier_options (group_id, name, price_delta_cents, sort_order)
				VALUES ($1, $2, $3, $4) RETURNING id
			`, groupID, oname, o.PriceDeltaCents, oi).Scan(&optionID); err != nil {
				return err
			}
			for _, ri := range o.Recipe {
				if ri.Quantity <= 0 {
					continue
				}
				// store guard: only materials of this store (skip foreign IDs).
				if _, err := tx.Exec(ctx, `
					INSERT INTO option_recipe_items (option_id, material_id, quantity)
					SELECT $1, $2, $3
					WHERE EXISTS (SELECT 1 FROM materials WHERE id = $2 AND store_id = $4)
					ON CONFLICT (option_id, material_id) DO UPDATE SET quantity = EXCLUDED.quantity
				`, optionID, ri.MaterialID, ri.Quantity, storeID); err != nil {
					return err
				}
			}
		}
	}
	return tx.Commit(ctx)
}

// ResolveSelection validates selected option IDs against the product's groups
// and returns the total price delta + per-option snapshots. Errors if a
// selected option doesn't belong to the product, a single-select group has >1
// pick, or a required group has 0 picks.
func (r *ModifierRepo) ResolveSelection(ctx context.Context, productID uuid.UUID, optionIDs []uuid.UUID) (int64, []OptionSnapshot, error) {
	groups, err := r.GetForProduct(ctx, productID)
	if err != nil {
		return 0, nil, err
	}
	// Index options by ID; track group membership.
	type optInfo struct {
		groupIdx int
		opt      ModifierOption
	}
	byID := map[uuid.UUID]optInfo{}
	for gi := range groups {
		for _, o := range groups[gi].Options {
			byID[o.ID] = optInfo{groupIdx: gi, opt: o}
		}
	}
	picksPerGroup := make([]int, len(groups))
	var delta int64
	var snaps []OptionSnapshot
	seen := map[uuid.UUID]bool{}
	for _, id := range optionIDs {
		if seen[id] {
			continue
		}
		seen[id] = true
		info, ok := byID[id]
		if !ok {
			return 0, nil, errors.New("opsi tidak valid untuk produk ini")
		}
		picksPerGroup[info.groupIdx]++
		delta += info.opt.PriceDeltaCents
		snaps = append(snaps, OptionSnapshot{
			OptionID:        info.opt.ID,
			GroupName:       groups[info.groupIdx].Name,
			OptionName:      info.opt.Name,
			PriceDeltaCents: info.opt.PriceDeltaCents,
		})
	}
	for gi, g := range groups {
		if g.Selection == "single" && picksPerGroup[gi] > 1 {
			return 0, nil, errors.New("grup \"" + g.Name + "\" hanya boleh pilih satu")
		}
		if g.IsRequired && picksPerGroup[gi] == 0 {
			return 0, nil, errors.New("grup \"" + g.Name + "\" wajib dipilih")
		}
	}
	return delta, snaps, nil
}

// insertOrderItemModifiersTx writes the chosen-option snapshots for one order
// line. Runs inside the caller's order transaction.
func insertOrderItemModifiersTx(ctx context.Context, tx pgx.Tx, orderItemID uuid.UUID, snaps []OptionSnapshot) error {
	for _, s := range snaps {
		var optID *uuid.UUID
		if s.OptionID != uuid.Nil {
			id := s.OptionID
			optID = &id
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO order_item_modifiers (order_item_id, option_id, group_name, option_name, price_delta_cents)
			VALUES ($1, $2, $3, $4, $5)
		`, orderItemID, optID, s.GroupName, s.OptionName, s.PriceDeltaCents); err != nil {
			return err
		}
	}
	return nil
}

// ReplaceBaseRecipe nukes the product's base recipe and inserts the new list.
// storeID guards cross-tenant material refs: only materials belonging to the
// same store are inserted (a foreign material_id is silently skipped).
func (r *ModifierRepo) ReplaceBaseRecipe(ctx context.Context, storeID, productID uuid.UUID, items []RecipeItem) error {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `DELETE FROM product_recipe_items WHERE product_id = $1`, productID); err != nil {
		return err
	}
	for _, it := range items {
		if it.Quantity <= 0 {
			continue
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO product_recipe_items (product_id, material_id, quantity)
			SELECT $1, $2, $3
			WHERE EXISTS (SELECT 1 FROM materials WHERE id = $2 AND store_id = $4)
			ON CONFLICT (product_id, material_id) DO UPDATE SET quantity = EXCLUDED.quantity
		`, productID, it.MaterialID, it.Quantity, storeID); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}
