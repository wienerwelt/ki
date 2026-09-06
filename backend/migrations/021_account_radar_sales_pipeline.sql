-- Leichte Vertriebs-Pipeline für gemeinsame Account-Radar-Aufgaben.
ALTER TABLE account_radar_tasks
    ADD COLUMN IF NOT EXISTS sales_stage TEXT,
    ADD COLUMN IF NOT EXISTS sales_stage_updated_at TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'account_radar_tasks_sales_stage_check'
          AND conrelid = 'account_radar_tasks'::regclass
    ) THEN
        ALTER TABLE account_radar_tasks
            ADD CONSTRAINT account_radar_tasks_sales_stage_check
            CHECK (
                sales_stage IS NULL
                OR sales_stage IN ('contacted', 'meeting', 'offer', 'won', 'lost')
            );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS account_radar_tasks_partner_sales_stage_idx
    ON account_radar_tasks(business_partner_id, sales_stage, updated_at DESC)
    WHERE sales_stage IS NOT NULL;
