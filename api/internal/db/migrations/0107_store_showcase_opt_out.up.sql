-- Opt-out from the public "toko yang sudah jalan" showcase on the SellOn
-- home page.
--
-- A seller's storefront is already public, so featuring it exposes nothing
-- new and sends them traffic — which is why this defaults to false rather
-- than requiring opt-in. But being used as a marketing face is a different
-- thing from merely having a public page, so the door has to exist from the
-- first day the showcase ships, not after someone asks for it.
ALTER TABLE stores
    ADD COLUMN IF NOT EXISTS showcase_opted_out BOOLEAN NOT NULL DEFAULT false;
