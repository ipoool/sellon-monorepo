ALTER TABLE stores
    DROP COLUMN IF EXISTS printer_method,
    DROP COLUMN IF EXISTS printer_paper_width,
    DROP COLUMN IF EXISTS printer_auto_print,
    DROP COLUMN IF EXISTS printer_copies,
    DROP COLUMN IF EXISTS printer_header,
    DROP COLUMN IF EXISTS printer_footer;
