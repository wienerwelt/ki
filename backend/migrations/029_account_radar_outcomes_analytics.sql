-- Professioneller Vertriebsworkflow und belastbare Erfolgsmessung im Account-Radar.
ALTER TABLE business_partner_accounts
    ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS business_partner_accounts_owner_idx
    ON business_partner_accounts(business_partner_id, owner_user_id)
    WHERE owner_user_id IS NOT NULL;

ALTER TABLE account_radar_tasks
    ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal',
    ADD COLUMN IF NOT EXISTS opportunity_value_eur NUMERIC(14, 2),
    ADD COLUMN IF NOT EXISTS opportunity_probability SMALLINT,
    ADD COLUMN IF NOT EXISTS first_contact_at TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'account_radar_tasks_priority_check'
          AND conrelid = 'account_radar_tasks'::regclass
    ) THEN
        ALTER TABLE account_radar_tasks
            ADD CONSTRAINT account_radar_tasks_priority_check
            CHECK (priority IN ('low', 'normal', 'high', 'urgent'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'account_radar_tasks_opportunity_value_check'
          AND conrelid = 'account_radar_tasks'::regclass
    ) THEN
        ALTER TABLE account_radar_tasks
            ADD CONSTRAINT account_radar_tasks_opportunity_value_check
            CHECK (opportunity_value_eur IS NULL OR opportunity_value_eur BETWEEN 0 AND 100000000);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'account_radar_tasks_opportunity_probability_check'
          AND conrelid = 'account_radar_tasks'::regclass
    ) THEN
        ALTER TABLE account_radar_tasks
            ADD CONSTRAINT account_radar_tasks_opportunity_probability_check
            CHECK (opportunity_probability IS NULL OR opportunity_probability BETWEEN 0 AND 100);
    END IF;
END $$;

UPDATE account_radar_tasks
SET first_contact_at = COALESCE(sales_stage_updated_at, updated_at, created_at)
WHERE first_contact_at IS NULL
  AND sales_stage IS NOT NULL;

CREATE INDEX IF NOT EXISTS account_radar_tasks_partner_first_contact_idx
    ON account_radar_tasks(business_partner_id, first_contact_at DESC)
    WHERE first_contact_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS account_radar_tasks_partner_pipeline_idx
    ON account_radar_tasks(business_partner_id, sales_stage, sales_stage_updated_at DESC);

CREATE TABLE IF NOT EXISTS account_radar_signal_feedback (
    business_partner_id UUID NOT NULL REFERENCES business_partners(id) ON DELETE CASCADE,
    tracked_article_id UUID NOT NULL REFERENCES business_partner_tracked_articles(id) ON DELETE CASCADE,
    relevance_status TEXT NOT NULL,
    reason TEXT,
    note TEXT,
    created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (business_partner_id, tracked_article_id),
    CONSTRAINT account_radar_signal_feedback_status_check
        CHECK (relevance_status IN ('relevant', 'irrelevant')),
    CONSTRAINT account_radar_signal_feedback_reason_check
        CHECK (
            reason IS NULL
            OR reason IN ('false_positive', 'outdated', 'duplicate', 'wrong_account', 'no_sales_relevance', 'other')
        ),
    CONSTRAINT account_radar_signal_feedback_note_length_check
        CHECK (note IS NULL OR char_length(note) <= 500),
    CONSTRAINT account_radar_signal_feedback_irrelevant_reason_check
        CHECK (relevance_status <> 'irrelevant' OR reason IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS account_radar_signal_feedback_partner_status_idx
    ON account_radar_signal_feedback(business_partner_id, relevance_status, updated_at DESC);
