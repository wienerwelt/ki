ALTER TABLE platform_updates
    ADD COLUMN IF NOT EXISTS audience_scope TEXT NOT NULL DEFAULT 'all';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'platform_updates_audience_scope_check'
    ) THEN
        ALTER TABLE platform_updates
            ADD CONSTRAINT platform_updates_audience_scope_check
            CHECK (audience_scope IN ('all', 'selected'));
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS platform_update_partners (
    update_id UUID NOT NULL REFERENCES platform_updates(id) ON DELETE CASCADE,
    business_partner_id UUID NOT NULL REFERENCES business_partners(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (update_id, business_partner_id)
);

CREATE INDEX IF NOT EXISTS platform_update_partners_partner_idx
    ON platform_update_partners (business_partner_id, update_id);
