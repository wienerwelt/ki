-- Mandantenspezifische Sales-Kampagnen bündeln Accounts, Signale und deren Aufgaben.
CREATE TABLE IF NOT EXISTS account_radar_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_partner_id UUID NOT NULL REFERENCES business_partners(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    objective TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    starts_on DATE,
    ends_on DATE,
    owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT account_radar_campaigns_name_length_check
        CHECK (char_length(trim(name)) BETWEEN 2 AND 120),
    CONSTRAINT account_radar_campaigns_objective_length_check
        CHECK (objective IS NULL OR char_length(objective) <= 1000),
    CONSTRAINT account_radar_campaigns_status_check
        CHECK (status IN ('draft', 'active', 'completed', 'archived')),
    CONSTRAINT account_radar_campaigns_date_check
        CHECK (starts_on IS NULL OR ends_on IS NULL OR starts_on <= ends_on)
);

CREATE UNIQUE INDEX IF NOT EXISTS account_radar_campaigns_partner_name_unique
    ON account_radar_campaigns (business_partner_id, lower(name))
    WHERE status <> 'archived';

CREATE INDEX IF NOT EXISTS account_radar_campaigns_partner_status_idx
    ON account_radar_campaigns (business_partner_id, status, starts_on, ends_on);

CREATE TABLE IF NOT EXISTS account_radar_campaign_accounts (
    campaign_id UUID NOT NULL REFERENCES account_radar_campaigns(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES business_partner_accounts(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (campaign_id, account_id)
);

CREATE INDEX IF NOT EXISTS account_radar_campaign_accounts_account_idx
    ON account_radar_campaign_accounts (account_id, campaign_id);

CREATE TABLE IF NOT EXISTS account_radar_campaign_signals (
    campaign_id UUID NOT NULL REFERENCES account_radar_campaigns(id) ON DELETE CASCADE,
    tracked_article_id UUID NOT NULL REFERENCES business_partner_tracked_articles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (campaign_id, tracked_article_id)
);

CREATE INDEX IF NOT EXISTS account_radar_campaign_signals_article_idx
    ON account_radar_campaign_signals (tracked_article_id, campaign_id);

