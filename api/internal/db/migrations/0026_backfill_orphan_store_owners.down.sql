-- No-op: down migration tidak menghapus membership karena tidak bisa
-- distinguish backfill ini dari membership yang dibuat normal lewat
-- /staff/invite. Safer to leave as-is on rollback.
SELECT 1;
