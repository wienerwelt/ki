-- Additive only: existing articles, users and audit/usage logs are retained.
CREATE TABLE ai_call_usage (
 id uuid PRIMARY KEY, provider text NOT NULL, model text NOT NULL,
 feature text NOT NULL, source_id text, job_id text,
 user_id uuid, business_partner_id uuid,
 scope text NOT NULL CHECK (scope IN ('tenant','shared','system')),
 status text NOT NULL DEFAULT 'started' CHECK (status IN ('started','completed','unknown')),
 prompt_tokens integer NOT NULL DEFAULT 0 CHECK (prompt_tokens >= 0),
 completion_tokens integer NOT NULL DEFAULT 0 CHECK (completion_tokens >= 0),
 total_tokens integer NOT NULL DEFAULT 0 CHECK (total_tokens >= 0),
 provider_request_id text, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE INDEX ON ai_call_usage (feature, created_at);
CREATE INDEX ON ai_call_usage (business_partner_id, created_at);

-- A canonical reporting view. Known duplicate activity records are excluded,
-- not deleted. Null-user background usage remains visible as shared/system.
CREATE VIEW ai_usage_events AS
 SELECT id::text, user_id, business_partner_id, job_id, model, feature, scope, status,
        prompt_tokens::bigint, completion_tokens::bigint, total_tokens::bigint,
        created_at, 'canonical'::text AS origin FROM ai_call_usage
 UNION ALL
 SELECT l.id::text, l.user_id, l.business_partner_id, l.job_id::text, l.model,
        'legacy_job', CASE WHEN l.business_partner_id IS NULL THEN 'system' ELSE 'tenant' END,
        'completed', l.prompt_tokens::bigint, l.completion_tokens::bigint,
        l.total_tokens::bigint, l.created_at, 'legacy_usage'
 FROM ai_usage_logs l
 UNION ALL
 SELECT a.id::text, a.user_id, u.business_partner_id, a.details->>'jobId',
        a.details->>'model', a.action_type,
        CASE WHEN u.business_partner_id IS NULL THEN 'system' ELSE 'tenant' END,
        'completed', COALESCE((a.details->'tokenUsage'->>'promptTokens')::bigint,0),
        COALESCE((a.details->'tokenUsage'->>'completionTokens')::bigint,0),
        COALESCE((a.details->'tokenUsage'->>'totalTokens')::bigint,0), a.timestamp, 'legacy_activity'
 FROM activity_log a LEFT JOIN users u ON u.id = a.user_id
 WHERE a.action_type LIKE 'AI_%_SUCCESS' AND a.details->'tokenUsage' IS NOT NULL
 AND a.details->'tokenUsage'->>'usageEventId' IS NULL
 AND NOT EXISTS (
   SELECT 1 FROM ai_usage_logs l WHERE l.job_id::text = a.details->>'jobId'
   AND l.user_id IS NOT DISTINCT FROM a.user_id AND l.model = a.details->>'model'
   AND l.total_tokens = (a.details->'tokenUsage'->>'totalTokens')::bigint
   AND abs(extract(epoch FROM (l.created_at - a.timestamp))) < 120
 );

CREATE TABLE career_ai_settings (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 enabled boolean NOT NULL DEFAULT false,
 auto_since timestamptz NOT NULL DEFAULT now(),
 daily_calls integer NOT NULL DEFAULT 20 CHECK(daily_calls BETWEEN 1 AND 100),
 monthly_tokens integer NOT NULL DEFAULT 120000 CHECK(monthly_tokens BETWEEN 10000 AND 1000000)
);
INSERT INTO career_ai_settings DEFAULT VALUES;
CREATE TABLE career_tenant_settings (
 business_partner_id uuid PRIMARY KEY REFERENCES business_partners(id) ON DELETE CASCADE,
 enabled boolean NOT NULL DEFAULT false,
 public_enabled boolean NOT NULL DEFAULT false,
 category_ids uuid[] NOT NULL DEFAULT '{}'
);
CREATE TABLE career_extractions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 content_hash text NOT NULL, prompt_version text NOT NULL,
 article_id uuid REFERENCES scraped_content(id) ON DELETE SET NULL,
 status text NOT NULL CHECK(status IN ('excluded','waiting','running','completed','failed')),
 reserved_tokens integer NOT NULL DEFAULT 0,
 usage_id uuid REFERENCES ai_call_usage(id), items jsonb NOT NULL DEFAULT '[]',
 error_code text, created_at timestamptz NOT NULL DEFAULT now(), attempted_at timestamptz,
 UNIQUE(content_hash,prompt_version)
);
CREATE TABLE career_article_checks (
 article_id uuid PRIMARY KEY REFERENCES scraped_content(id) ON DELETE CASCADE,
 content_hash text NOT NULL, checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE career_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 business_partner_id uuid NOT NULL REFERENCES business_partners(id) ON DELETE CASCADE,
 extraction_id uuid REFERENCES career_extractions(id) ON DELETE SET NULL,
 item_index integer, author_id uuid REFERENCES users(id) ON DELETE SET NULL,
 person_name text NOT NULL, organization text NOT NULL, role_title text NOT NULL DEFAULT '',
 kind text NOT NULL CHECK(kind IN ('appointment','change','promotion','departure')),
 effective_date date, published_date date, summary text NOT NULL,
 source_url text, portrait_key text, photo_consent boolean NOT NULL DEFAULT false,
 requested_public boolean NOT NULL DEFAULT false, public_approved boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','withdrawn')),
 fingerprint text NOT NULL, review_note text NOT NULL DEFAULT '',
 reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
 version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(business_partner_id,extraction_id,item_index),
 CHECK(NOT public_approved OR (status = 'approved' AND requested_public)),
 CHECK(portrait_key IS NULL OR photo_consent)
);
CREATE INDEX ON career_entries(business_partner_id,status,created_at);
CREATE INDEX ON career_entries(business_partner_id,fingerprint);
CREATE TABLE career_comments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entry_id uuid NOT NULL REFERENCES career_entries(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 content text NOT NULL CHECK(length(content) BETWEEN 1 AND 1000), created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO widget_types(name,type_key,description,icon_name,is_removable,is_resizable,is_draggable,
 default_width,default_height,default_min_width,default_min_height,allowed_roles,config,component_key)
 VALUES('Menschen & Karriere','PeopleCareer','Personalien aus der Branche und der eigenen Community.','People',true,true,true,
 6,7,4,4,ARRAY['admin','assistenz','user','demo'],'{"title":"Menschen & Karriere"}','PeopleCareer')
 ON CONFLICT(type_key) DO NOTHING;
INSERT INTO business_partner_widget_access(business_partner_id,widget_type_id,is_public)
 SELECT bp.id,w.id,false FROM business_partners bp CROSS JOIN widget_types w
 WHERE w.type_key='PeopleCareer' AND 'content'=ANY(bp.enabled_modules)
 ON CONFLICT DO NOTHING;
