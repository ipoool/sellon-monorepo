-- Per-store "alert me here" number for outbound notifications (Twilio
-- WhatsApp new-order alerts). Separate from stores.whatsapp_number
-- because that's the public-facing number buyers contact; this is the
-- private inbox the owner watches.
--
-- Empty string = notifications disabled for this store. Stored as plain
-- text rather than encrypted because the number is also visible in any
-- WhatsApp conversation the seller has — no incremental secrecy gained
-- by encryption at rest.
ALTER TABLE stores
    ADD COLUMN IF NOT EXISTS notification_whatsapp_number TEXT NOT NULL DEFAULT '';
