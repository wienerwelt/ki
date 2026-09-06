-- Messbare, optionale Kampagnenziele für das mandantenspezifische Sales-Cockpit.
ALTER TABLE account_radar_campaigns
    ADD COLUMN IF NOT EXISTS target_accounts INTEGER,
    ADD COLUMN IF NOT EXISTS target_contacts INTEGER,
    ADD COLUMN IF NOT EXISTS target_meetings INTEGER,
    ADD COLUMN IF NOT EXISTS target_offers INTEGER,
    ADD COLUMN IF NOT EXISTS target_wins INTEGER,
    ADD COLUMN IF NOT EXISTS target_pipeline_eur NUMERIC(14, 2);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'account_radar_campaigns_targets_check'
          AND conrelid = 'account_radar_campaigns'::regclass
    ) THEN
        ALTER TABLE account_radar_campaigns
            ADD CONSTRAINT account_radar_campaigns_targets_check
            CHECK (
                (target_accounts IS NULL OR target_accounts BETWEEN 0 AND 1000000)
                AND (target_contacts IS NULL OR target_contacts BETWEEN 0 AND 1000000)
                AND (target_meetings IS NULL OR target_meetings BETWEEN 0 AND 1000000)
                AND (target_offers IS NULL OR target_offers BETWEEN 0 AND 1000000)
                AND (target_wins IS NULL OR target_wins BETWEEN 0 AND 1000000)
                AND (target_pipeline_eur IS NULL OR target_pipeline_eur BETWEEN 0 AND 1000000000000)
            );
    END IF;
END $$;
