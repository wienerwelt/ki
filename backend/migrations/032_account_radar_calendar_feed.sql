-- Widerrufbarer, signierter Kalenderfeed pro Mandant.
CREATE TABLE IF NOT EXISTS account_radar_calendar_feeds (
    business_partner_id UUID PRIMARY KEY REFERENCES business_partners(id) ON DELETE CASCADE,
    token_version UUID NOT NULL DEFAULT gen_random_uuid(),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

