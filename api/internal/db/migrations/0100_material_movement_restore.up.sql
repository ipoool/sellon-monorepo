-- Allow compensating 'restore' rows in the material ledger. Voiding/returning a
-- POS order must put consumed raw materials back and leave an auditable trail;
-- reverseConsumptionTx writes movement_type='restore', which the original
-- three-value CHECK rejected.
ALTER TABLE material_movements
    DROP CONSTRAINT IF EXISTS material_movements_movement_type_check;
ALTER TABLE material_movements
    ADD CONSTRAINT material_movements_movement_type_check
    CHECK (movement_type IN ('restock', 'consume', 'adjust', 'restore'));
