-- Pricing change: POS, dine-in (Meja & QR + KDS), membership/loyalty, AI
-- analytics + cash reports, custom checkout fields, and thermal printer are now
-- Bisnis-only (moved out of Pro). Reflect that on the public pricing card by
-- listing them under the Bisnis plan's marketing bullets. Pro's bullets already
-- don't claim these features, so only the Bisnis row changes.
UPDATE plans
SET features = '[
  "Semua fitur Pro",
  "Kasir POS lengkap (shift, struk thermal)",
  "Meja & QR + Kitchen Display (dine-in)",
  "Membership & poin loyalti",
  "Analisa AI + laporan keuangan & arus kas",
  "Custom field checkout",
  "Domain custom (segera)",
  "Support prioritas via email & WhatsApp"
]'::jsonb
WHERE tier = 'bisnis';
