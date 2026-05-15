-- Backfill ulang owner membership untuk store yang ke-bypass migration
-- 0012 (mis. dibuat lewat StoreHandler.Create yang sebelumnya tidak
-- insert ke store_members → user stuck di loop /setup → /dashboard
-- → /setup).
--
-- Idempotent — ON CONFLICT skip baris yang sudah ada. Aman dijalankan
-- berulang kali; tidak akan duplikasi member.
INSERT INTO store_members (store_id, user_id, role)
SELECT s.id, s.owner_id, 'owner'
FROM stores s
WHERE NOT EXISTS (
    SELECT 1 FROM store_members m
    WHERE m.store_id = s.id AND m.user_id = s.owner_id
)
ON CONFLICT (store_id, user_id) DO NOTHING;
