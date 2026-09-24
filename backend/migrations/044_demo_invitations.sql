ALTER TABLE business_partners
    ADD COLUMN IF NOT EXISTS is_demo_tenant BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS demo_scenario TEXT;

ALTER TABLE business_partners
    ADD CONSTRAINT business_partners_demo_scenario_check
    CHECK (demo_scenario IS NULL OR demo_scenario IN ('content', 'sales', 'both'));

CREATE INDEX IF NOT EXISTS business_partners_demo_scenario_idx
    ON business_partners (demo_scenario) WHERE is_demo_tenant = TRUE;

CREATE TABLE IF NOT EXISTS demo_invitations (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    token_hash CHAR(64) NOT NULL UNIQUE,
    scenario TEXT NOT NULL CHECK (scenario IN ('content', 'sales', 'both')),
    organization_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    delivery_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (delivery_status IN ('pending', 'sent', 'failed'))
);

CREATE INDEX IF NOT EXISTS demo_invitations_user_created_idx
    ON demo_invitations (user_id, created_at DESC);
