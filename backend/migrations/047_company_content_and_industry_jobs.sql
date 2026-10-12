-- Company intelligence without AI: deterministic aliases connect directory providers,
-- articles, career entries and a moderated industry job market.

CREATE OR REPLACE FUNCTION mobiliti_normalize_entity(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
    SELECT trim(regexp_replace(lower(COALESCE(value, '')), '[^[:alnum:]]+', ' ', 'g'))
$$;

CREATE OR REPLACE FUNCTION mobiliti_normalize_entity_case(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
    SELECT trim(regexp_replace(COALESCE(value, ''), '[^[:alnum:]]+', ' ', 'g'))
$$;

CREATE TABLE IF NOT EXISTS directory_provider_aliases (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id uuid NOT NULL REFERENCES directory_providers(id) ON DELETE CASCADE,
    alias text NOT NULL CHECK (char_length(trim(alias)) BETWEEN 2 AND 255),
    normalized_alias text NOT NULL,
    source text NOT NULL DEFAULT 'manual'
        CHECK (source IN ('manual', 'name', 'derived', 'domain')),
    confidence integer NOT NULL DEFAULT 90 CHECK (confidence BETWEEN 1 AND 100),
    is_system_generated boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (provider_id, normalized_alias)
);
CREATE INDEX IF NOT EXISTS idx_directory_provider_aliases_lookup
    ON directory_provider_aliases(normalized_alias)
    WHERE is_active;

ALTER TABLE directory_provider_mentions
    ADD COLUMN IF NOT EXISTS match_type text NOT NULL DEFAULT 'name',
    ADD COLUMN IF NOT EXISTS matched_term text,
    ADD COLUMN IF NOT EXISTS match_status text NOT NULL DEFAULT 'automatic',
    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'directory_provider_mentions_match_status_check'
          AND conrelid = 'directory_provider_mentions'::regclass
    ) THEN
        ALTER TABLE directory_provider_mentions
            ADD CONSTRAINT directory_provider_mentions_match_status_check
            CHECK (match_status IN ('automatic', 'confirmed', 'rejected'));
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_directory_provider_mentions_article
    ON directory_provider_mentions(scraped_content_id, match_status, mention_confidence DESC);

ALTER TABLE career_entries
    ADD COLUMN IF NOT EXISTS organization_provider_id uuid
        REFERENCES directory_providers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_career_entries_organization_provider
    ON career_entries(business_partner_id, organization_provider_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS career_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_partner_id uuid NOT NULL REFERENCES business_partners(id) ON DELETE CASCADE,
    provider_id uuid REFERENCES directory_providers(id) ON DELETE SET NULL,
    source_article_id uuid REFERENCES scraped_content(id) ON DELETE SET NULL,
    created_by uuid REFERENCES users(id) ON DELETE SET NULL,
    reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
    title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 3 AND 240),
    organization text NOT NULL CHECK (char_length(trim(organization)) BETWEEN 2 AND 180),
    location text NOT NULL DEFAULT '',
    employment_type text NOT NULL DEFAULT '',
    summary text NOT NULL CHECK (char_length(trim(summary)) BETWEEN 3 AND 2500),
    application_url text,
    source_url text,
    published_date date,
    valid_until date,
    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
    requested_public boolean NOT NULL DEFAULT false,
    public_approved boolean NOT NULL DEFAULT false,
    detection_method text NOT NULL DEFAULT 'manual'
        CHECK (detection_method IN ('manual', 'article_rule')),
    fingerprint text NOT NULL,
    review_note text NOT NULL DEFAULT '',
    version integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (NOT public_approved OR (status = 'approved' AND requested_public)),
    CHECK (valid_until IS NULL OR published_date IS NULL OR valid_until >= published_date)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_career_jobs_tenant_source_article
    ON career_jobs(business_partner_id, source_article_id)
    WHERE source_article_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_career_jobs_tenant_status
    ON career_jobs(business_partner_id, status, valid_until, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_career_jobs_provider
    ON career_jobs(provider_id, status, created_at DESC);

CREATE OR REPLACE FUNCTION mobiliti_sync_provider_aliases(p_provider_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    provider_row directory_providers%ROWTYPE;
    simplified_name text;
    website_host text;
BEGIN
    SELECT * INTO provider_row FROM directory_providers WHERE id = p_provider_id;
    IF NOT FOUND THEN RETURN; END IF;

    DELETE FROM directory_provider_aliases
    WHERE provider_id = p_provider_id AND is_system_generated = true;

    INSERT INTO directory_provider_aliases
        (provider_id, alias, normalized_alias, source, confidence, is_system_generated)
    VALUES
        (provider_row.id, trim(provider_row.name), mobiliti_normalize_entity(provider_row.name), 'name', 100, true)
    ON CONFLICT (provider_id, normalized_alias) DO NOTHING;

    simplified_name := trim(regexp_replace(
        provider_row.name,
        '[[:space:]]+(gmbh([[:space:]]*&[[:space:]]*co\.?[[:space:]]*kg)?|ag|kg|og|e\.?[[:space:]]*u\.?|ltd\.?|limited|inc\.?|corporation|corp\.?)\.?[[:space:]]*$',
        '',
        'i'
    ));
    IF char_length(mobiliti_normalize_entity(simplified_name)) >= 4
       AND mobiliti_normalize_entity(simplified_name) <> mobiliti_normalize_entity(provider_row.name)
       AND mobiliti_normalize_entity(simplified_name) NOT IN
           ('service', 'services', 'solutions', 'software', 'group', 'holding', 'mobility', 'automotive') THEN
        INSERT INTO directory_provider_aliases
            (provider_id, alias, normalized_alias, source, confidence, is_system_generated)
        VALUES
            (provider_row.id, simplified_name, mobiliti_normalize_entity(simplified_name), 'derived', 88, true)
        ON CONFLICT (provider_id, normalized_alias) DO NOTHING;
    END IF;

    website_host := split_part(
        regexp_replace(
            regexp_replace(lower(trim(COALESCE(provider_row.website_url, ''))), '^https?://', '', 'i'),
            '^www\.',
            '',
            'i'
        ),
        '/',
        1
    );
    website_host := split_part(website_host, ':', 1);
    IF website_host LIKE '%.%' AND char_length(website_host) BETWEEN 4 AND 200 THEN
        INSERT INTO directory_provider_aliases
            (provider_id, alias, normalized_alias, source, confidence, is_system_generated)
        VALUES
            (provider_row.id, website_host, mobiliti_normalize_entity(website_host), 'domain', 98, true)
        ON CONFLICT (provider_id, normalized_alias) DO NOTHING;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION mobiliti_refresh_article_provider_mentions(p_article_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    article_text text;
    article_text_case text;
BEGIN
    SELECT
        mobiliti_normalize_entity(concat_ws(' ', title, summary, full_text, original_url)),
        mobiliti_normalize_entity_case(concat_ws(' ', title, summary, full_text, original_url))
    INTO article_text, article_text_case
    FROM scraped_content
    WHERE id = p_article_id;

    IF article_text IS NULL THEN RETURN; END IF;

    DELETE FROM directory_provider_mentions
    WHERE scraped_content_id = p_article_id
      AND match_status = 'automatic';

    INSERT INTO directory_provider_mentions
        (provider_id, scraped_content_id, mention_confidence, match_type, matched_term, match_status, updated_at)
    SELECT DISTINCT ON (alias.provider_id)
        alias.provider_id,
        p_article_id,
        alias.confidence,
        alias.source,
        alias.alias,
        'automatic',
        now()
    FROM directory_provider_aliases alias
    JOIN directory_providers provider ON provider.id = alias.provider_id
    WHERE alias.is_active
      AND (
          (
              char_length(alias.normalized_alias) >= 4
              AND position(' ' || alias.normalized_alias || ' ' IN ' ' || article_text || ' ') > 0
          )
          OR (
              char_length(alias.normalized_alias) = 3
              AND alias.alias = upper(alias.alias)
              AND position(
                    ' ' || mobiliti_normalize_entity_case(alias.alias) || ' '
                    IN ' ' || article_text_case || ' '
                  ) > 0
          )
      )
    ORDER BY alias.provider_id, alias.confidence DESC, char_length(alias.normalized_alias) DESC
    ON CONFLICT (provider_id, scraped_content_id) DO UPDATE
    SET mention_confidence = EXCLUDED.mention_confidence,
        match_type = EXCLUDED.match_type,
        matched_term = EXCLUDED.matched_term,
        updated_at = now()
    WHERE directory_provider_mentions.match_status = 'automatic';
END;
$$;

CREATE OR REPLACE FUNCTION mobiliti_link_career_organization()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.organization_provider_id IS NULL
       OR TG_OP = 'INSERT'
       OR NEW.organization IS DISTINCT FROM OLD.organization THEN
        SELECT alias.provider_id INTO NEW.organization_provider_id
        FROM directory_provider_aliases alias
        WHERE alias.is_active
          AND alias.normalized_alias = mobiliti_normalize_entity(NEW.organization)
        ORDER BY alias.confidence DESC, alias.is_system_generated ASC
        LIMIT 1;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION mobiliti_link_job_organization()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.provider_id IS NULL
       OR TG_OP = 'INSERT'
       OR NEW.organization IS DISTINCT FROM OLD.organization THEN
        SELECT alias.provider_id INTO NEW.provider_id
        FROM directory_provider_aliases alias
        WHERE alias.is_active
          AND alias.normalized_alias = mobiliti_normalize_entity(NEW.organization)
        ORDER BY alias.confidence DESC, alias.is_system_generated ASC
        LIMIT 1;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION mobiliti_refresh_article_job_candidates(p_article_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    article_row scraped_content%ROWTYPE;
    normalized_text text;
    tenant_row record;
    matched_provider_id uuid;
    matched_provider_name text;
BEGIN
    SELECT * INTO article_row FROM scraped_content WHERE id = p_article_id;
    IF NOT FOUND OR article_row.event_date IS NOT NULL THEN RETURN; END IF;

    normalized_text := mobiliti_normalize_entity(concat_ws(' ', article_row.title, article_row.summary, article_row.original_url));
    IF normalized_text !~ '(^| )(stellenangebot|offene stelle|wir suchen|karriere bei|jobangebot|bewerben sie sich|m w d|vacancy|join our team|career opportunity|jobs)( |$)' THEN
        DELETE FROM career_jobs
        WHERE source_article_id = p_article_id
          AND detection_method = 'article_rule'
          AND status = 'pending';
        RETURN;
    END IF;

    FOR tenant_row IN
        SELECT settings.business_partner_id
        FROM career_tenant_settings settings
        JOIN business_partners partner ON partner.id = settings.business_partner_id
        WHERE settings.enabled
          AND partner.is_active
          AND 'content' = ANY(partner.enabled_modules)
          AND article_row.category_id = ANY(settings.category_ids)
          AND (
              NOT EXISTS (
                  SELECT 1 FROM business_partner_regions
                  WHERE business_partner_id = settings.business_partner_id
              )
              OR EXISTS (
                  SELECT 1
                  FROM business_partner_regions bp_region
                  JOIN regions region ON region.id = bp_region.region_id
                  WHERE bp_region.business_partner_id = settings.business_partner_id
                    AND (region.code = article_row.region OR article_row.region IN ('EU', 'GLOBAL', 'WORLD'))
              )
          )
    LOOP
        SELECT provider.id, provider.name
        INTO matched_provider_id, matched_provider_name
        FROM directory_provider_mentions mention
        JOIN directory_providers provider ON provider.id = mention.provider_id
        JOIN directory_provider_mandant_settings tenant_provider
          ON tenant_provider.provider_id = provider.id
         AND tenant_provider.business_partner_id = tenant_row.business_partner_id
         AND tenant_provider.status = 'active'
        WHERE mention.scraped_content_id = article_row.id
          AND mention.match_status <> 'rejected'
        ORDER BY mention.mention_confidence DESC
        LIMIT 1;

        INSERT INTO career_jobs (
            business_partner_id, provider_id, source_article_id, title, organization,
            summary, source_url, application_url, published_date, requested_public,
            detection_method, fingerprint
        ) VALUES (
            tenant_row.business_partner_id,
            matched_provider_id,
            article_row.id,
            article_row.title,
            COALESCE(matched_provider_name, NULLIF(article_row.source_identifier, ''), 'Organisation noch zu prüfen'),
            COALESCE(NULLIF(left(article_row.summary, 2500), ''), left(article_row.title, 2500)),
            article_row.original_url,
            article_row.original_url,
            article_row.published_date,
            true,
            'article_rule',
            md5(lower(concat_ws('|', article_row.title, COALESCE(matched_provider_name, article_row.source_identifier), article_row.original_url)))
        )
        ON CONFLICT (business_partner_id, source_article_id) WHERE source_article_id IS NOT NULL
        DO UPDATE SET
            provider_id = COALESCE(career_jobs.provider_id, EXCLUDED.provider_id),
            organization = CASE
                WHEN career_jobs.organization = 'Organisation noch zu prüfen' THEN EXCLUDED.organization
                ELSE career_jobs.organization
            END,
            updated_at = now()
        WHERE career_jobs.status = 'pending'
          AND career_jobs.detection_method = 'article_rule';

        matched_provider_id := NULL;
        matched_provider_name := NULL;
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION mobiliti_after_provider_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    article_id uuid;
BEGIN
    PERFORM mobiliti_sync_provider_aliases(NEW.id);

    FOR article_id IN
        SELECT DISTINCT candidate.id
        FROM scraped_content candidate
        WHERE candidate.id IN (
            SELECT mention.scraped_content_id
            FROM directory_provider_mentions mention
            WHERE mention.provider_id = NEW.id
        )
        OR EXISTS (
            SELECT 1
            FROM directory_provider_aliases alias
            WHERE alias.provider_id = NEW.id
              AND alias.is_active
              AND char_length(alias.normalized_alias) >= 4
              AND position(
                    ' ' || alias.normalized_alias || ' '
                    IN ' ' || mobiliti_normalize_entity(concat_ws(' ', candidate.title, candidate.summary, candidate.full_text, candidate.original_url)) || ' '
                  ) > 0
        )
    LOOP
        PERFORM mobiliti_refresh_article_provider_mentions(article_id);
        PERFORM mobiliti_refresh_article_job_candidates(article_id);
    END LOOP;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION mobiliti_after_article_company_refresh()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM mobiliti_refresh_article_provider_mentions(NEW.id);
    PERFORM mobiliti_refresh_article_job_candidates(NEW.id);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_directory_provider_alias_refresh ON directory_providers;
CREATE TRIGGER trg_directory_provider_alias_refresh
AFTER INSERT OR UPDATE OF name, website_url ON directory_providers
FOR EACH ROW EXECUTE FUNCTION mobiliti_after_provider_change();

DROP TRIGGER IF EXISTS trg_scraped_content_company_refresh ON scraped_content;
CREATE TRIGGER trg_scraped_content_company_refresh
AFTER INSERT OR UPDATE OF title, summary, full_text, original_url, category_id, region ON scraped_content
FOR EACH ROW EXECUTE FUNCTION mobiliti_after_article_company_refresh();

DROP TRIGGER IF EXISTS trg_career_entry_organization_link ON career_entries;
CREATE TRIGGER trg_career_entry_organization_link
BEFORE INSERT OR UPDATE OF organization, organization_provider_id ON career_entries
FOR EACH ROW EXECUTE FUNCTION mobiliti_link_career_organization();

DROP TRIGGER IF EXISTS trg_career_job_organization_link ON career_jobs;
CREATE TRIGGER trg_career_job_organization_link
BEFORE INSERT OR UPDATE OF organization, provider_id ON career_jobs
FOR EACH ROW EXECUTE FUNCTION mobiliti_link_job_organization();

-- Seed aliases and connect the existing archive. These operations are deterministic,
-- idempotent and do not call an external provider or consume AI tokens.
SELECT mobiliti_sync_provider_aliases(id) FROM directory_providers;
SELECT mobiliti_refresh_article_provider_mentions(id) FROM scraped_content;
UPDATE career_entries SET organization = organization;
SELECT mobiliti_refresh_article_job_candidates(id) FROM scraped_content;
