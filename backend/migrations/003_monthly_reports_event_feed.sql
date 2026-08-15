-- Monatliche Mandantenreports dürfen pro Empfänger und Berichtsmonat nur
-- einmal versendet werden, auch bei manuellen Retries oder mehreren Workern.
CREATE TABLE IF NOT EXISTS monthly_report_deliveries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_partner_id uuid NOT NULL REFERENCES business_partners (id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    report_month date NOT NULL,
    status varchar(20) NOT NULL DEFAULT 'sending' CHECK (status IN ('sending', 'sent')),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at timestamptz,
    CONSTRAINT monthly_report_delivery_unique UNIQUE (business_partner_id, user_id, report_month)
);

-- Der Job wird nur ergänzt, wenn er in einer Umgebung noch nicht existiert.
-- Vorhandene, bewusst angepasste Zeitpläne bleiben unverändert.
INSERT INTO cronjobs (name, recipient_group, schedule, is_active)
SELECT 'monthly-report', 'assistenz,admin', '0 2 1 * *', TRUE
WHERE NOT EXISTS (
    SELECT 1 FROM cronjobs WHERE name = 'monthly-report'
);

-- Ein kanonischer Termin kann von mehreren Quellen gemeldet werden. Der
-- Fingerprint verhindert neue Dubletten; die Quelltabelle bewahrt Herkunft
-- und inhaltliche Ergänzungen wie Veranstaltungsort oder Adresse.
ALTER TABLE scraped_content
    ADD COLUMN IF NOT EXISTS event_fingerprint char(64);

CREATE UNIQUE INDEX IF NOT EXISTS idx_scraped_content_event_fingerprint
    ON scraped_content (event_fingerprint)
    WHERE event_date IS NOT NULL AND event_fingerprint IS NOT NULL;

CREATE TABLE IF NOT EXISTS scraped_content_sources (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    scraped_content_id uuid NOT NULL REFERENCES scraped_content (id) ON DELETE CASCADE,
    source_identifier varchar(255) NOT NULL,
    source_url text NOT NULL,
    source_guid text,
    raw_summary text,
    first_seen_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT scraped_content_source_unique UNIQUE (scraped_content_id, source_url)
);

CREATE INDEX IF NOT EXISTS idx_scraped_content_sources_identifier
    ON scraped_content_sources (source_identifier, last_seen_at DESC);

-- Der öffentliche Branchenfeed wird täglich als globale Fleet-Terminquelle
-- eingelesen. Die eigentliche Verarbeitung erfolgt im bestehenden Scraper.
INSERT INTO scraping_rules (
    name,
    source_identifier,
    url_pattern,
    category_default,
    is_active,
    region,
    schedule,
    rule_type,
    use_headless_browser,
    scraping_strategy,
    scrape_after_date
)
SELECT
    'Fuhrparknews Termine RSS',
    'fuhrparknews_events',
    'https://www.fuhrparknews.at/termine/feed/',
    'fleet_events',
    TRUE,
    'AT',
    '15 4 * * *',
    'content',
    FALSE,
    'standard',
    CURRENT_DATE - 1
WHERE NOT EXISTS (
    SELECT 1
    FROM scraping_rules
    WHERE source_identifier = 'fuhrparknews_events'
       OR url_pattern = 'https://www.fuhrparknews.at/termine/feed/'
);
