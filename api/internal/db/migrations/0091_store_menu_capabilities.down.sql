ALTER TABLE stores
    DROP COLUMN IF EXISTS cap_pos,
    DROP COLUMN IF EXISTS cap_reseller,
    DROP COLUMN IF EXISTS cap_digital,
    DROP COLUMN IF EXISTS cap_materials,
    DROP COLUMN IF EXISTS seller_types,
    DROP COLUMN IF EXISTS profiling_completed_at;
