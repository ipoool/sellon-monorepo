-- Backfill customers.email from their orders.
--
-- The storefront customer-upsert historically did not persist customer_email
-- onto the customers row (only the order carried it), so existing customers
-- show a blank email on the detail page even though they checked out with one
-- (notably digital/course buyers, where email is mandatory). The upsert is now
-- fixed going forward; this one-shot backfill fills the gap for existing rows.
--
-- For each customer currently missing an email, take the email from their most
-- recent order that actually has one. Idempotent + only touches blank emails.
UPDATE customers c
SET email = sub.customer_email,
    updated_at = now()
FROM (
    SELECT DISTINCT ON (o.customer_id)
           o.customer_id,
           o.customer_email
    FROM orders o
    WHERE o.customer_id IS NOT NULL
      AND COALESCE(o.customer_email, '') <> ''
    ORDER BY o.customer_id, o.created_at DESC
) sub
WHERE c.id = sub.customer_id
  AND COALESCE(c.email, '') = '';
