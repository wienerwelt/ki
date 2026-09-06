-- Mandantenspezifische Daily-/Weekly-Radar-Einstellungen.
CREATE TABLE IF NOT EXISTS account_radar_settings (
    business_partner_id UUID PRIMARY KEY REFERENCES business_partners(id) ON DELETE CASCADE,
    digest_frequency VARCHAR(16) NOT NULL DEFAULT 'off'
        CHECK (digest_frequency IN ('off', 'daily', 'weekdays', 'weekly')),
    delivery_hour SMALLINT NOT NULL DEFAULT 8
        CHECK (delivery_hour BETWEEN 0 AND 23),
    weekly_day SMALLINT NOT NULL DEFAULT 1
        CHECK (weekly_day BETWEEN 1 AND 7),
    min_relevance SMALLINT NOT NULL DEFAULT 70
        CHECK (min_relevance BETWEEN 1 AND 99),
    updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS account_radar_digest_recipients (
    business_partner_id UUID NOT NULL REFERENCES business_partners(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (business_partner_id, user_id)
);

CREATE INDEX IF NOT EXISTS account_radar_digest_recipients_user_idx
    ON account_radar_digest_recipients(user_id);

CREATE TABLE IF NOT EXISTS account_radar_digest_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_partner_id UUID NOT NULL REFERENCES business_partners(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    campaign_key VARCHAR(64) NOT NULL,
    recipient_email VARCHAR(254) NOT NULL,
    signal_count INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(16) NOT NULL DEFAULT 'sending'
        CHECK (status IN ('sending', 'sent', 'skipped', 'failed')),
    provider_message_id TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    UNIQUE (business_partner_id, user_id, campaign_key)
);

CREATE INDEX IF NOT EXISTS account_radar_digest_deliveries_partner_created_idx
    ON account_radar_digest_deliveries(business_partner_id, created_at DESC);

-- Der Job läuft stündlich; die Mandanteneinstellung entscheidet über Stunde und Frequenz.
INSERT INTO cronjobs (name, recipient_group, schedule, is_active)
SELECT 'account-radar-digest', 'newsletter', '10 * * * *', TRUE
WHERE NOT EXISTS (SELECT 1 FROM cronjobs WHERE name = 'account-radar-digest');
