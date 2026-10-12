CREATE OR REPLACE FUNCTION mobiliti_article_matches_partner_region(
    p_business_partner_id uuid,
    p_article_region text
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT
        NOT EXISTS (
            SELECT 1
            FROM business_partner_regions
            WHERE business_partner_id = p_business_partner_id
        )
        OR NULLIF(btrim(COALESCE(p_article_region, '')), '') IS NULL
        OR EXISTS (
            SELECT 1
            FROM business_partner_regions bp_region
            JOIN regions region ON region.id = bp_region.region_id
            WHERE bp_region.business_partner_id = p_business_partner_id
              AND (
                  upper(region.code) = upper(p_article_region)
                  OR upper(p_article_region) IN ('EU', 'GLOBAL', 'WORLD')
                  OR (upper(p_article_region) = 'DACH' AND upper(region.code) IN ('AT', 'DE', 'CH', 'DACH'))
                  OR (upper(region.code) = 'DACH' AND upper(p_article_region) IN ('AT', 'DE', 'CH'))
              )
        );
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
          AND mobiliti_article_matches_partner_region(settings.business_partner_id, article_row.region)
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

-- Re-evaluate existing articles deterministically. This does not call an AI provider.
SELECT mobiliti_refresh_article_job_candidates(id) FROM scraped_content;
