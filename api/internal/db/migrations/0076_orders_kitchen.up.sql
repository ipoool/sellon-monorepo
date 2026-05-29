ALTER TABLE orders
    ADD COLUMN kitchen_status   TEXT CHECK (kitchen_status IN ('queued','preparing','ready','served')),
    ADD COLUMN serving_type     TEXT NOT NULL DEFAULT '',
    ADD COLUMN table_id         UUID REFERENCES restaurant_tables(id) ON DELETE SET NULL,
    ADD COLUMN queue_number     INT,
    ADD COLUMN queue_date       DATE,
    ADD COLUMN kitchen_ready_at TIMESTAMPTZ;

CREATE INDEX idx_orders_kitchen ON orders (store_id, kitchen_status) WHERE kitchen_status IS NOT NULL;

CREATE TABLE order_queue_counters (
    store_id    UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    queue_date  DATE NOT NULL,
    last_number INT NOT NULL DEFAULT 0,
    PRIMARY KEY (store_id, queue_date)
);
