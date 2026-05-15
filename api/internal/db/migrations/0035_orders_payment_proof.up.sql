-- Bukti transfer manual yang di-upload pembeli setelah order dibuat.
-- Hanya relevan untuk pembayaran manual (transfer, qris_statis,
-- wa_konfirmasi) — order yang dibayar via Midtrans gateway tidak butuh
-- bukti karena status pembayaran datang dari webhook.
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS payment_proof_url  TEXT        NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS payment_proof_note TEXT        NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS payment_proof_at   TIMESTAMPTZ;
