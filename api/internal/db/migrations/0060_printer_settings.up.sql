-- Per-store thermal printer / receipt print preferences.
-- method: 'browser' (OS/browser print dialog, works everywhere incl. iPad)
--         'bluetooth' (Web Bluetooth ESC/POS direct — Chrome/Android only)
-- paper_width: '58' or '80' (mm) — drives receipt CSS width + ESC/POS line width
ALTER TABLE stores
    ADD COLUMN IF NOT EXISTS printer_method      TEXT    NOT NULL DEFAULT 'browser',
    ADD COLUMN IF NOT EXISTS printer_paper_width TEXT    NOT NULL DEFAULT '58',
    ADD COLUMN IF NOT EXISTS printer_auto_print  BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS printer_copies      INT     NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS printer_header      TEXT    NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS printer_footer      TEXT    NOT NULL DEFAULT '';
