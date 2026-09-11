package repository_test

// Integration tests for cross-tenant write isolation (real Postgres, see
// authflow_integration_test.go for how to run).
//
// The repository layer takes ids as arguments and several write paths trusted
// them. The handlers happen to resolve those ids store-scoped today, so these
// are the boundary nobody should have to re-verify by reading every caller:
// a foreign id must change nothing, ever.

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/sellon/sellon/api/internal/repository"
)

// seedMaterialRecipe gives a store a material and wires it into a product's
// recipe, returning both plus the current stock.
func seedMaterialRecipe(t *testing.T, pool *pgxpool.Pool, storeID, productID uuid.UUID, stock int64) uuid.UUID {
	t.Helper()
	ctx := context.Background()
	var materialID uuid.UUID
	if err := pool.QueryRow(ctx,
		`INSERT INTO materials (store_id, name, base_unit, stock, cost_cents)
		 VALUES ($1, 'Susu', 'ml', $2, 100) RETURNING id`,
		storeID, stock).Scan(&materialID); err != nil {
		t.Fatalf("seed material: %v", err)
	}
	if _, err := pool.Exec(ctx,
		`INSERT INTO product_recipe_items (product_id, material_id, quantity) VALUES ($1, $2, 10)`,
		productID, materialID); err != nil {
		t.Fatalf("seed recipe: %v", err)
	}
	return materialID
}

func materialStock(t *testing.T, pool *pgxpool.Pool, id uuid.UUID) int64 {
	t.Helper()
	var stock int64
	if err := pool.QueryRow(context.Background(),
		`SELECT stock FROM materials WHERE id = $1`, id).Scan(&stock); err != nil {
		t.Fatalf("read material stock: %v", err)
	}
	return stock
}

// The consume/restore pair was asymmetric: the restore re-asserted store_id
// and the decrement did not, so the only unguarded half was the one that
// destroys stock. A recipe row pointing at a material in another store would
// have drained that store's shelves and written a material_movements row
// pairing this store with their material — corrupting both stores' COGS.
func TestMaterialConsumptionCannotCrossTenants(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	orders := repository.NewOrderRepo(pool)

	victimStore, victimProduct := seedStoreProduct(t, pool)
	victimMaterial := seedMaterialRecipe(t, pool, victimStore, victimProduct, 1000)

	attackerStore, attackerProduct := seedStoreProduct(t, pool)
	// The crafted state: the attacker's own product's recipe points at the
	// victim's material.
	if _, err := pool.Exec(ctx,
		`INSERT INTO product_recipe_items (product_id, material_id, quantity) VALUES ($1, $2, 10)`,
		attackerProduct, victimMaterial); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx,
		`UPDATE products SET product_type = 'physical', stock = 100 WHERE id = $1`, attackerProduct); err != nil {
		t.Fatal(err)
	}

	before := materialStock(t, pool, victimMaterial)
	if _, err := orders.Create(ctx, repository.CreateOrderInput{
		StoreID:       attackerStore,
		CustomerName:  "Attacker",
		CustomerWA:    "62899" + randSuffix(),
		PaymentMethod: "transfer",
		Items: []repository.OrderItemInput{{
			ProductID: attackerProduct, ProductName: "Kopi",
			UnitCents: 1000000, Quantity: 3, ProductType: "physical",
		}},
	}); err != nil {
		t.Fatalf("create: %v", err)
	}

	if after := materialStock(t, pool, victimMaterial); after != before {
		t.Fatalf("another store's material moved from %d to %d — cross-tenant consumption", before, after)
	}
	var movements int
	if err := pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM material_movements WHERE material_id = $1 AND store_id = $2`,
		victimMaterial, attackerStore).Scan(&movements); err != nil {
		t.Fatal(err)
	}
	if movements != 0 {
		t.Fatalf("%d ledger row(s) pair one store with another store's material", movements)
	}
}

// The store's OWN recipe still works — the guard must not break the feature
// it is protecting.
func TestMaterialConsumptionStillWorksWithinTheStore(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	orders := repository.NewOrderRepo(pool)

	storeID, productID := seedStoreProduct(t, pool)
	materialID := seedMaterialRecipe(t, pool, storeID, productID, 1000)
	if _, err := pool.Exec(ctx,
		`UPDATE products SET product_type = 'physical', stock = 100 WHERE id = $1`, productID); err != nil {
		t.Fatal(err)
	}

	if _, err := orders.Create(ctx, repository.CreateOrderInput{
		StoreID:       storeID,
		CustomerName:  "Buyer",
		CustomerWA:    "62898" + randSuffix(),
		PaymentMethod: "transfer",
		Items: []repository.OrderItemInput{{
			ProductID: productID, ProductName: "Kopi",
			UnitCents: 1000000, Quantity: 3, ProductType: "physical",
		}},
	}); err != nil {
		t.Fatalf("create: %v", err)
	}
	// 3 units x 10 per unit.
	if got := materialStock(t, pool, materialID); got != 970 {
		t.Fatalf("own material stock: got %d, want 970", got)
	}
}

// The stock decrement is the statement that destroys inventory. Its POS
// counterpart was already store-scoped; this one was not.
func TestStockDecrementCannotCrossTenants(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	orders := repository.NewOrderRepo(pool)

	victimStore, victimProduct := seedStoreProduct(t, pool)
	_ = victimStore
	if _, err := pool.Exec(ctx,
		`UPDATE products SET product_type = 'physical', stock = 50 WHERE id = $1`, victimProduct); err != nil {
		t.Fatal(err)
	}
	attackerStore, _ := seedStoreProduct(t, pool)

	_, err := orders.Create(ctx, repository.CreateOrderInput{
		StoreID:       attackerStore,
		CustomerName:  "Attacker",
		CustomerWA:    "62897" + randSuffix(),
		PaymentMethod: "transfer",
		Items: []repository.OrderItemInput{{
			ProductID: victimProduct, ProductName: "Barang orang",
			UnitCents: 1000000, Quantity: 5, ProductType: "physical",
		}},
	})
	if err != repository.ErrStockInsufficient {
		t.Fatalf("ordering another store's product: want ErrStockInsufficient, got %v", err)
	}

	var stock int
	if err := pool.QueryRow(ctx, `SELECT stock FROM products WHERE id = $1`, victimProduct).Scan(&stock); err != nil {
		t.Fatal(err)
	}
	if stock != 50 {
		t.Fatalf("another store's stock changed to %d — cross-tenant decrement", stock)
	}
}
