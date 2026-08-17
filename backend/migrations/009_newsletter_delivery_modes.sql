-- Ein Mandant entscheidet bewusst, wie sein Branchenbriefing verteilt wird.
-- "mobiliti" versendet an bestätigte Nutzer, "export" nur an die zentrale
-- Mandantenadresse und "external" überlässt den Versand einem Drittsystem.
ALTER TABLE business_partners
    ADD COLUMN IF NOT EXISTS newsletter_delivery_mode varchar(20) NOT NULL DEFAULT 'mobiliti',
    ADD COLUMN IF NOT EXISTS newsletter_export_email varchar(254),
    ADD COLUMN IF NOT EXISTS newsletter_external_signup_url text,
    ADD COLUMN IF NOT EXISTS newsletter_recipient_limit integer NOT NULL DEFAULT 250;

ALTER TABLE business_partners
    DROP CONSTRAINT IF EXISTS business_partners_newsletter_delivery_mode_check,
    DROP CONSTRAINT IF EXISTS business_partners_newsletter_recipient_limit_check;

ALTER TABLE business_partners
    ADD CONSTRAINT business_partners_newsletter_delivery_mode_check
        CHECK (newsletter_delivery_mode IN ('mobiliti', 'export', 'external')),
    ADD CONSTRAINT business_partners_newsletter_recipient_limit_check
        CHECK (newsletter_recipient_limit BETWEEN 1 AND 100000);

-- Newsletter-Einwilligung und Briefing-Wunsch sind getrennte Informationen.
-- Dadurch kann ein Nutzer das Daily-Cockpit-Briefing deaktivieren, ohne eine
-- anderweitig erteilte Newsletter-Einwilligung zu verlieren.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS briefing_email_enabled boolean NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS newsletter_opt_in_confirmed_at timestamptz,
    ADD COLUMN IF NOT EXISTS newsletter_opt_in_source varchar(64),
    ADD COLUMN IF NOT EXISTS newsletter_consent_version varchar(32),
    ADD COLUMN IF NOT EXISTS newsletter_unsubscribed_at timestamptz;

UPDATE users
SET briefing_email_enabled = TRUE,
    newsletter_opt_in_confirmed_at = COALESCE(newsletter_opt_in_confirmed_at, updated_at, created_at),
    newsletter_opt_in_source = COALESCE(newsletter_opt_in_source, 'legacy'),
    newsletter_consent_version = COALESCE(newsletter_consent_version, '2026-08')
WHERE newsletter_opt_in = TRUE;

-- Zustellung wird vor dem Senden reserviert. Der Unique-Key verhindert
-- Doppelversand bei Worker-Retries oder parallel laufenden Scheduler-Prozessen.
CREATE TABLE IF NOT EXISTS newsletter_deliveries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_partner_id uuid NOT NULL REFERENCES business_partners (id) ON DELETE CASCADE,
    user_id uuid REFERENCES users (id) ON DELETE SET NULL,
    recipient_email varchar(254) NOT NULL,
    delivery_type varchar(50) NOT NULL DEFAULT 'industry_briefing',
    campaign_key varchar(128) NOT NULL,
    delivery_mode varchar(20) NOT NULL,
    status varchar(20) NOT NULL DEFAULT 'sending'
        CHECK (status IN ('sending', 'sent', 'failed', 'skipped')),
    provider_message_id text,
    error_message text,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at timestamptz,
    failed_at timestamptz,
    CONSTRAINT newsletter_delivery_unique
        UNIQUE (business_partner_id, delivery_type, campaign_key, recipient_email)
);

CREATE INDEX IF NOT EXISTS idx_newsletter_deliveries_partner_created
    ON newsletter_deliveries (business_partner_id, created_at DESC);

INSERT INTO cronjobs (name, recipient_group, schedule, is_active)
SELECT 'daily-briefing', 'newsletter', '30 8 * * *', TRUE
WHERE NOT EXISTS (SELECT 1 FROM cronjobs WHERE name = 'daily-briefing');
