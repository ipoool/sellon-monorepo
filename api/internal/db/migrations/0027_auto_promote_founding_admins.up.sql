-- Auto-promote founding admin lewat trigger.
--
-- Why ini terpisah dari 0025 (yang UPDATE-only): kalau user belum
-- pernah login saat 0025 jalan, UPDATE no-op. Saat user akhirnya login
-- via Google → INSERT users row dengan role default 'user' → tidak
-- pernah dapat promote.
--
-- Trigger BEFORE INSERT ini menutup gap itu: setiap user baru dengan
-- email match list founding admins otomatis dapat role='admin' sejak
-- detik pertama row-nya exist.
--
-- Catatan idempotency: BEFORE UPDATE tidak di-pasang sengaja — sekali
-- user di-create admin, kalau admin UI nanti kasih cara demote, trigger
-- tidak akan auto-revert. Yang penting cuma "auto-promote at birth".

-- Daftar founding admins. Tambah email baru di IN (...) list, lalu bikin
-- migration BARU dengan UPDATE catchall untuk row yang sudah ada.
CREATE OR REPLACE FUNCTION auto_promote_founding_admins()
RETURNS TRIGGER AS $$
BEGIN
    IF LOWER(NEW.email) IN (
        LOWER('asepulloh0109@gmail.com')
    ) THEN
        NEW.role := 'admin';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_promote_founding_admins ON users;
CREATE TRIGGER trg_auto_promote_founding_admins
    BEFORE INSERT ON users
    FOR EACH ROW
    EXECUTE FUNCTION auto_promote_founding_admins();
