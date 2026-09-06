-- Gemeinsame, mandantenspezifische Vertriebsaufgaben und nachvollziehbarer Verlauf.
CREATE TABLE IF NOT EXISTS account_radar_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_partner_id UUID NOT NULL REFERENCES business_partners(id) ON DELETE CASCADE,
    tracked_article_id UUID NOT NULL REFERENCES business_partner_tracked_articles(id) ON DELETE CASCADE,
    assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action_type TEXT,
    follow_up_at TIMESTAMPTZ,
    note TEXT,
    task_status TEXT NOT NULL DEFAULT 'open',
    created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT account_radar_tasks_article_unique UNIQUE (tracked_article_id),
    CONSTRAINT account_radar_tasks_action_type_check
        CHECK (action_type IS NULL OR action_type IN ('contact_planned', 'follow_up')),
    CONSTRAINT account_radar_tasks_status_check
        CHECK (task_status IN ('open', 'done', 'cancelled')),
    CONSTRAINT account_radar_tasks_note_length_check
        CHECK (note IS NULL OR char_length(note) <= 1500)
);

CREATE INDEX IF NOT EXISTS account_radar_tasks_partner_status_due_idx
    ON account_radar_tasks(business_partner_id, task_status, follow_up_at);

CREATE INDEX IF NOT EXISTS account_radar_tasks_assignee_status_idx
    ON account_radar_tasks(assigned_user_id, task_status, follow_up_at)
    WHERE assigned_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS account_radar_task_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES account_radar_tasks(id) ON DELETE CASCADE,
    business_partner_id UUID NOT NULL REFERENCES business_partners(id) ON DELETE CASCADE,
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS account_radar_task_events_task_created_idx
    ON account_radar_task_events(task_id, created_at DESC);

CREATE INDEX IF NOT EXISTS account_radar_task_events_partner_created_idx
    ON account_radar_task_events(business_partner_id, created_at DESC);

-- Vorhandene persönliche Planungen einmalig in gemeinsame Aufgaben überführen.
WITH latest_workflow AS (
    SELECT DISTINCT ON (item_status.tracked_article_id)
        account.business_partner_id,
        item_status.tracked_article_id,
        item_status.user_id,
        item_status.action_type,
        item_status.follow_up_at,
        item_status.note,
        CASE WHEN item_status.status = 'done' THEN 'done' ELSE 'open' END AS task_status,
        COALESCE(item_status.action_updated_at, item_status.updated_at, CURRENT_TIMESTAMP) AS workflow_updated_at
    FROM account_intelligence_item_status item_status
    JOIN business_partner_tracked_articles article ON article.id = item_status.tracked_article_id
    JOIN business_partner_accounts account ON account.id = article.account_id
    WHERE item_status.action_type IS NOT NULL
       OR item_status.note IS NOT NULL
    ORDER BY item_status.tracked_article_id,
             COALESCE(item_status.action_updated_at, item_status.updated_at) DESC NULLS LAST
)
INSERT INTO account_radar_tasks (
    business_partner_id,
    tracked_article_id,
    assigned_user_id,
    action_type,
    follow_up_at,
    note,
    task_status,
    created_by_user_id,
    updated_by_user_id,
    completed_at,
    created_at,
    updated_at
)
SELECT
    business_partner_id,
    tracked_article_id,
    user_id,
    action_type,
    follow_up_at,
    note,
    task_status,
    user_id,
    user_id,
    CASE WHEN task_status = 'done' THEN workflow_updated_at ELSE NULL END,
    workflow_updated_at,
    workflow_updated_at
FROM latest_workflow
ON CONFLICT (tracked_article_id) DO NOTHING;
