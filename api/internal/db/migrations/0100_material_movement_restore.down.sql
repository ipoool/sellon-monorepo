-- Restore rows can't satisfy the narrower CHECK, so drop them before shrinking
-- the constraint back (down-migration is destructive by necessity).
DELETE FROM material_movements WHERE movement_type = 'restore';
ALTER TABLE material_movements
    DROP CONSTRAINT IF EXISTS material_movements_movement_type_check;
ALTER TABLE material_movements
    ADD CONSTRAINT material_movements_movement_type_check
    CHECK (movement_type IN ('restock', 'consume', 'adjust'));
