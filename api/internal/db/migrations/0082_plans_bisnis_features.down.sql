UPDATE plans
SET features = '[
  "Semua fitur Pro",
  "Domain custom (segera)",
  "Support via email & WhatsApp"
]'::jsonb
WHERE tier = 'bisnis';
