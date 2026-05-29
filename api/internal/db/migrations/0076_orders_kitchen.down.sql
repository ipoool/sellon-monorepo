DROP TABLE order_queue_counters;
DROP INDEX IF EXISTS idx_orders_kitchen;
ALTER TABLE orders
    DROP COLUMN kitchen_status,
    DROP COLUMN serving_type,
    DROP COLUMN table_id,
    DROP COLUMN queue_number,
    DROP COLUMN queue_date,
    DROP COLUMN kitchen_ready_at;
