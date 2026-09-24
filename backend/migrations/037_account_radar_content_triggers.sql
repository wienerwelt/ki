-- Premium-Beobachtungsprofile verbinden das vorhandene CONTENT-Archiv mit
-- accountbezogenen Signalen im Account-Radar. Basic bleibt unverändert.
CREATE TABLE IF NOT EXISTS account_radar_trigger_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_partner_id UUID NOT NULL REFERENCES business_partners(id) ON DELETE CASCADE,
    template_key TEXT,
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    include_keywords TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    exclude_keywords TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    account_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
    include_competitors BOOLEAN NOT NULL DEFAULT FALSE,
    lookback_days SMALLINT NOT NULL DEFAULT 30,
    min_content_relevance SMALLINT NOT NULL DEFAULT 0,
    created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT account_radar_trigger_profiles_name_check
        CHECK (char_length(trim(name)) BETWEEN 2 AND 120),
    CONSTRAINT account_radar_trigger_profiles_description_check
        CHECK (description IS NULL OR char_length(description) <= 500),
    CONSTRAINT account_radar_trigger_profiles_lookback_check
        CHECK (lookback_days IN (7, 30, 90, 365)),
    CONSTRAINT account_radar_trigger_profiles_relevance_check
        CHECK (min_content_relevance BETWEEN 0 AND 100),
    CONSTRAINT account_radar_trigger_profiles_keyword_count_check
        CHECK (cardinality(include_keywords) BETWEEN 1 AND 25 AND cardinality(exclude_keywords) <= 25),
    CONSTRAINT account_radar_trigger_profiles_account_count_check
        CHECK (cardinality(account_ids) <= 500)
);

CREATE UNIQUE INDEX IF NOT EXISTS account_radar_trigger_profiles_partner_name_unique
    ON account_radar_trigger_profiles (business_partner_id, lower(name));

CREATE UNIQUE INDEX IF NOT EXISTS account_radar_trigger_profiles_partner_template_unique
    ON account_radar_trigger_profiles (business_partner_id, template_key)
    WHERE template_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS account_radar_trigger_profiles_active_idx
    ON account_radar_trigger_profiles (business_partner_id, is_active)
    WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS account_radar_content_trigger_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_partner_id UUID NOT NULL REFERENCES business_partners(id) ON DELETE CASCADE,
    trigger_profile_id UUID NOT NULL REFERENCES account_radar_trigger_profiles(id) ON DELETE CASCADE,
    scraped_content_id UUID NOT NULL REFERENCES scraped_content(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES business_partner_accounts(id) ON DELETE CASCADE,
    tracked_article_id UUID REFERENCES business_partner_tracked_articles(id) ON DELETE SET NULL,
    competitor_name TEXT,
    matched_keywords TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    match_score SMALLINT NOT NULL DEFAULT 70,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT account_radar_content_trigger_matches_score_check
        CHECK (match_score BETWEEN 1 AND 99)
);

CREATE UNIQUE INDEX IF NOT EXISTS account_radar_content_trigger_matches_unique
    ON account_radar_content_trigger_matches (
        trigger_profile_id,
        scraped_content_id,
        account_id,
        COALESCE(competitor_name, '')
    );

CREATE INDEX IF NOT EXISTS account_radar_content_trigger_matches_article_idx
    ON account_radar_content_trigger_matches (tracked_article_id)
    WHERE tracked_article_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS account_radar_content_trigger_matches_partner_idx
    ON account_radar_content_trigger_matches (business_partner_id, created_at DESC);
