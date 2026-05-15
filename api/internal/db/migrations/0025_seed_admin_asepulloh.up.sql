-- One-time promote untuk row yang sudah exist saat migration ini jalan.
-- Lihat juga 0027_auto_promote_founding_admins yang pasang trigger
-- untuk row yang baru di-INSERT setelah migration ini.
UPDATE users SET role = 'admin'
    WHERE LOWER(email) = LOWER('asepulloh0109@gmail.com');
