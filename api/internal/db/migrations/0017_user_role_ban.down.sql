ALTER TABLE audit_log DROP COLUMN IF EXISTS impersonator_user_id;
DROP INDEX IF EXISTS platform_audit_log_target_store_idx;
DROP INDEX IF EXISTS platform_audit_log_target_user_idx;
DROP INDEX IF EXISTS platform_audit_log_actor_idx;
DROP TABLE IF EXISTS platform_audit_log;
DROP INDEX IF EXISTS users_role_idx;
ALTER TABLE users
    DROP COLUMN IF EXISTS banned_at,
    DROP COLUMN IF EXISTS role;
