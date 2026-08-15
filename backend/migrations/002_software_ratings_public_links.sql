CREATE TABLE IF NOT EXISTS software_ratings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    software_tool_id uuid NOT NULL,
    business_partner_id uuid NOT NULL,
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT software_ratings_tool_tenant_fkey
        FOREIGN KEY (software_tool_id, business_partner_id)
        REFERENCES software_tools (id, business_partner_id)
        ON DELETE CASCADE,
    CONSTRAINT software_ratings_user_tool_unique
        UNIQUE (software_tool_id, business_partner_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_software_ratings_tenant_tool
    ON software_ratings (business_partner_id, software_tool_id);

-- Bereits vorhandene Community-Bewertungen übernehmen. Pro Nutzer zählt die
-- jeweils jüngste Bewertung; Erfahrungsbeiträge bleiben separat erhalten.
INSERT INTO software_ratings (
    software_tool_id,
    business_partner_id,
    user_id,
    rating,
    created_at,
    updated_at
)
SELECT DISTINCT ON (cp.software_tool_id, cp.business_partner_id, cp.user_id)
    cp.software_tool_id,
    cp.business_partner_id,
    cp.user_id,
    cp.software_rating,
    cp.created_at,
    cp.created_at
FROM community_posts cp
WHERE cp.software_tool_id IS NOT NULL
  AND cp.software_rating IS NOT NULL
ORDER BY cp.software_tool_id, cp.business_partner_id, cp.user_id, cp.created_at DESC
ON CONFLICT (software_tool_id, business_partner_id, user_id) DO UPDATE
SET rating = EXCLUDED.rating,
    updated_at = EXCLUDED.updated_at;

-- Freundliche, stabile Public-URLs für bestehende Mandanten ohne Slug.
WITH generated AS (
    SELECT
        id,
        NULLIF(TRIM(BOTH '-' FROM regexp_replace(
            translate(lower(name), 'äöüß', 'aous'),
            '[^a-z0-9]+', '-', 'g'
        )), '') AS base_slug
    FROM business_partners
    WHERE slug IS NULL OR BTRIM(slug) = ''
), ranked AS (
    SELECT
        id,
        base_slug,
        ROW_NUMBER() OVER (PARTITION BY base_slug ORDER BY id) AS duplicate_number
    FROM generated
)
UPDATE business_partners bp
SET slug = CASE
    WHEN ranked.base_slug IS NULL THEN 'partner-' || RIGHT(bp.id::text, 8)
    WHEN EXISTS (
        SELECT 1 FROM business_partners existing
        WHERE existing.id <> bp.id AND lower(existing.slug) = ranked.base_slug
    ) OR ranked.duplicate_number > 1
        THEN ranked.base_slug || '-' || RIGHT(bp.id::text, 8)
    ELSE ranked.base_slug
END
FROM ranked
WHERE bp.id = ranked.id;

-- Das Action-Widget enthält nicht nur IT-Produkte, sondern Lösungen,
-- Kampagnen und gesponserte Angebote. Der Name bildet das neutral ab.
UPDATE widget_types
SET name = 'Lösungen & Angebote',
    description = 'Mandantenspezifische Partner-Lösungen, Aktionen und gesponserte Angebote.',
    config = COALESCE(config, '{}'::jsonb) || '{"title":"Lösungen & Angebote"}'::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE type_key = 'BusinessPartnerAktionen';
