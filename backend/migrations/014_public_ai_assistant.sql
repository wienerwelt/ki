CREATE TABLE IF NOT EXISTS public_ai_assistant_settings (
    business_partner_id uuid PRIMARY KEY REFERENCES business_partners(id) ON DELETE CASCADE,
    site_key uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    is_enabled boolean NOT NULL DEFAULT false,
    source_url text,
    allowed_origins text[] NOT NULL DEFAULT ARRAY[]::text[],
    assistant_name varchar(120) NOT NULL DEFAULT 'Digitaler Branchenassistent',
    welcome_message varchar(500) NOT NULL DEFAULT 'Hallo! Wie kann ich Ihnen weiterhelfen?',
    max_pages integer NOT NULL DEFAULT 30 CHECK (max_pages BETWEEN 1 AND 100),
    daily_question_limit integer NOT NULL DEFAULT 300 CHECK (daily_question_limit BETWEEN 1 AND 100000),
    monthly_token_limit integer NOT NULL DEFAULT 1000000 CHECK (monthly_token_limit BETWEEN 1000 AND 1000000000),
    last_crawled_at timestamptz,
    last_crawl_status varchar(30) NOT NULL DEFAULT 'not_started'
        CHECK (last_crawl_status IN ('not_started', 'running', 'success', 'failed')),
    last_crawl_error text,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public_ai_documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_partner_id uuid NOT NULL REFERENCES business_partners(id) ON DELETE CASCADE,
    source_url text NOT NULL,
    canonical_url text NOT NULL,
    title varchar(500),
    chunk_index integer NOT NULL DEFAULT 0 CHECK (chunk_index >= 0),
    content text NOT NULL,
    content_hash char(64) NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    fetched_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (business_partner_id, canonical_url, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_public_ai_documents_partner_active
    ON public_ai_documents (business_partner_id, is_active);

CREATE INDEX IF NOT EXISTS idx_public_ai_documents_search
    ON public_ai_documents
    USING gin (to_tsvector('german', COALESCE(title, '') || ' ' || COALESCE(content, '')));

CREATE TABLE IF NOT EXISTS public_ai_usage (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_partner_id uuid NOT NULL REFERENCES business_partners(id) ON DELETE CASCADE,
    ip_hash char(64) NOT NULL,
    session_hash char(64) NOT NULL,
    question_hash char(64) NOT NULL,
    status varchar(30) NOT NULL DEFAULT 'started'
        CHECK (status IN ('started', 'completed', 'failed', 'rejected', 'no_source')),
    model varchar(120),
    prompt_tokens integer NOT NULL DEFAULT 0 CHECK (prompt_tokens >= 0),
    completion_tokens integer NOT NULL DEFAULT 0 CHECK (completion_tokens >= 0),
    total_tokens integer NOT NULL DEFAULT 0 CHECK (total_tokens >= 0),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_public_ai_usage_partner_created
    ON public_ai_usage (business_partner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_public_ai_usage_ip_created
    ON public_ai_usage (ip_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_public_ai_usage_session_created
    ON public_ai_usage (session_hash, created_at DESC);

CREATE TABLE IF NOT EXISTS public_ai_response_cache (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_partner_id uuid NOT NULL REFERENCES business_partners(id) ON DELETE CASCADE,
    question_hash char(64) NOT NULL,
    source_version timestamptz NOT NULL,
    answer text NOT NULL,
    sources jsonb NOT NULL DEFAULT '[]'::jsonb,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (business_partner_id, question_hash, source_version)
);

CREATE INDEX IF NOT EXISTS idx_public_ai_response_cache_expiry
    ON public_ai_response_cache (expires_at);

COMMENT ON TABLE public_ai_assistant_settings IS
    'Mandantenspezifische Konfiguration des öffentlichen, ausschließlich homepagebasierten KI-Assistenten.';

COMMENT ON TABLE public_ai_documents IS
    'Öffentlich freigegebene, mandantenspezifisch getrennte Homepage-Abschnitte für den Public-RAG-Kontext.';

COMMENT ON TABLE public_ai_usage IS
    'Datensparsame Nutzungs- und Tokenzählung des öffentlichen KI-Assistenten; IP und Session werden nur gehasht gespeichert.';

COMMENT ON TABLE public_ai_response_cache IS
    'Kurzzeit-Cache identischer Fragen je Mandant und Homepage-Datenstand zur Senkung des Tokenverbrauchs.';
