-- Marketing consent.
--
-- The weekly "tips" email went to every registered user: ListForMarketing
-- selected all of them, there was no consent column, and no template carried
-- an unsubscribe link. That is unsolicited bulk mail under any reading of
-- CAN-SPAM or a provider's ToS, and it is why our sending account was
-- suspended — taking every transactional email down with it.
--
-- NULL means "has not opted in", and every existing row starts NULL on
-- purpose: prior signups consented to an account, not to marketing, so none
-- of them may be migrated into it.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS marketing_opt_in_at TIMESTAMPTZ;

-- The weekly job scans for opted-in users; keep that cheap and skip the
-- (overwhelming) majority of rows that never opt in.
CREATE INDEX IF NOT EXISTS users_marketing_opt_in_idx
    ON users (marketing_opt_in_at)
    WHERE marketing_opt_in_at IS NOT NULL AND banned_at IS NULL;
