-- Mandantengebundene externe Quellen fuer Sales Premium. Die eigentlichen
-- Inhalte laufen weiterhin ueber scraping_rules -> scraped_content und damit
-- durch dieselbe Deduplizierung und Trigger-Pipeline wie CONTENT.
ALTER TABLE scraping_rules
    ADD COLUMN IF NOT EXISTS business_partner_id UUID REFERENCES business_partners(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS account_radar_source_type TEXT,
    ADD COLUMN IF NOT EXISTS account_radar_requested_url TEXT;

ALTER TABLE scraping_rules
    DROP CONSTRAINT IF EXISTS scraping_rules_account_radar_source_type_check;

ALTER TABLE scraping_rules
    ADD CONSTRAINT scraping_rules_account_radar_source_type_check
    CHECK (account_radar_source_type IS NULL OR account_radar_source_type IN ('rss', 'website'));

CREATE INDEX IF NOT EXISTS scraping_rules_account_radar_sources_idx
    ON scraping_rules (business_partner_id, is_active, created_at DESC)
    WHERE account_radar_source_type IS NOT NULL AND archived_at IS NULL;
