-- Buyer tracking consent, captured at checkout.
--
-- The storefront cookie banner tells the buyer that clicking "Tolak" stops
-- their visit data reaching Meta. That was only true of the browser Pixel:
-- the server-side Conversions API still sent a Purchase carrying the
-- buyer's email and phone number at payment time, because nothing on the
-- server knew what the buyer had chosen. Recording the answer on the order
-- is what lets the paid-event path honour it.
--
-- NULL means "not recorded" — orders placed before this column existed, and
-- channels with no banner (POS, kiosk). Those keep the previous behaviour;
-- only an explicit false suppresses the event.
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS tracking_consent BOOLEAN;
