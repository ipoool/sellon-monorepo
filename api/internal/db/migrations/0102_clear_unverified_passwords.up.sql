-- Clear passwords on rows that never proved their email.
--
-- Before migration 0097, /auth/register wrote the submitted password
-- straight onto the row for ANY email, verified or not. So a row can exist
-- with an attacker's bcrypt hash and email_verified_at IS NULL, planted by
-- registering someone else's address and never entering the code.
--
-- On its own that hash is useless: login requires IsEmailVerified(). But
-- Google sign-in now links an identity onto an email-matched row and stamps
-- email_verified_at — which would promote that planted hash into a working
-- password for the victim's account. Under the current rule a password only
-- ever exists on a verified row, so an unverified one is by definition not
-- legitimate and is cleared here.
--
-- Affected users are not locked out: the address is their own, so Google
-- sign-in works, and password reset re-establishes a password once outbound
-- mail is restored.
UPDATE users
SET password_hash = '', updated_at = now()
WHERE password_hash <> '' AND email_verified_at IS NULL;
