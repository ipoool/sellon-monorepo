DROP INDEX IF EXISTS photobooth_sessions_photo_token_uniq;
ALTER TABLE photobooth_sessions
    DROP COLUMN IF EXISTS photo_token,
    DROP COLUMN IF EXISTS photo_expires_at;
