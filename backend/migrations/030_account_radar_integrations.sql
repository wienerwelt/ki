-- Sichere, mandantengebundene Integrationen und stabile externe IDs.
ALTER TABLE business_partner_accounts
    ADD COLUMN IF NOT EXISTS external_id TEXT;

ALTER TABLE business_partner_account_contacts
    ADD COLUMN IF NOT EXISTS external_id TEXT;

ALTER TABLE account_radar_tasks
    ADD COLUMN IF NOT EXISTS external_id TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'business_partner_accounts_external_id_length_check'
          AND conrelid = 'business_partner_accounts'::regclass
    ) THEN
        ALTER TABLE business_partner_accounts
            ADD CONSTRAINT business_partner_accounts_external_id_length_check
            CHECK (external_id IS NULL OR char_length(TRIM(external_id)) BETWEEN 1 AND 160);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'account_contacts_external_id_length_check'
          AND conrelid = 'business_partner_account_contacts'::regclass
    ) THEN
        ALTER TABLE business_partner_account_contacts
            ADD CONSTRAINT account_contacts_external_id_length_check
            CHECK (external_id IS NULL OR char_length(TRIM(external_id)) BETWEEN 1 AND 160);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'account_radar_tasks_external_id_length_check'
          AND conrelid = 'account_radar_tasks'::regclass
    ) THEN
        ALTER TABLE account_radar_tasks
            ADD CONSTRAINT account_radar_tasks_external_id_length_check
            CHECK (external_id IS NULL OR char_length(TRIM(external_id)) BETWEEN 1 AND 160);
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS business_partner_accounts_external_id_unique
    ON business_partner_accounts(business_partner_id, external_id)
    WHERE external_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS account_contacts_external_id_unique
    ON business_partner_account_contacts(account_id, external_id)
    WHERE external_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS account_radar_tasks_external_id_unique
    ON account_radar_tasks(business_partner_id, external_id)
    WHERE external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS account_radar_api_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_partner_id UUID NOT NULL REFERENCES business_partners(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    token_prefix TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    scopes TEXT[] NOT NULL DEFAULT ARRAY['accounts:read']::TEXT[],
    expires_at TIMESTAMPTZ NOT NULL,
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT account_radar_api_tokens_name_check
        CHECK (char_length(TRIM(name)) BETWEEN 1 AND 120),
    CONSTRAINT account_radar_api_tokens_prefix_check
        CHECK (char_length(token_prefix) BETWEEN 8 AND 24),
    CONSTRAINT account_radar_api_tokens_scopes_check
        CHECK (
            cardinality(scopes) BETWEEN 1 AND 5
            AND scopes <@ ARRAY[
                'accounts:read', 'accounts:write', 'tasks:read', 'tasks:write', 'analytics:read'
            ]::TEXT[]
        )
);

CREATE INDEX IF NOT EXISTS account_radar_api_tokens_partner_active_idx
    ON account_radar_api_tokens(business_partner_id, created_at DESC)
    WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS account_radar_api_sync_logs (
    id BIGSERIAL PRIMARY KEY,
    business_partner_id UUID NOT NULL REFERENCES business_partners(id) ON DELETE CASCADE,
    token_id UUID REFERENCES account_radar_api_tokens(id) ON DELETE SET NULL,
    operation TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    external_id TEXT,
    response_status SMALLINT NOT NULL,
    duration_ms INTEGER,
    request_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT account_radar_api_sync_logs_operation_check
        CHECK (operation IN ('list', 'upsert', 'analytics')),
    CONSTRAINT account_radar_api_sync_logs_resource_check
        CHECK (resource_type IN ('accounts', 'tasks', 'analytics')),
    CONSTRAINT account_radar_api_sync_logs_status_check
        CHECK (response_status BETWEEN 100 AND 599),
    CONSTRAINT account_radar_api_sync_logs_duration_check
        CHECK (duration_ms IS NULL OR duration_ms >= 0)
);

CREATE INDEX IF NOT EXISTS account_radar_api_sync_logs_partner_created_idx
    ON account_radar_api_sync_logs(business_partner_id, created_at DESC);

