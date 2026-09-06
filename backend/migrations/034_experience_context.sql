-- Erfahrungen im Software-Lexikon und Branchenverzeichnis werden künftig
-- fachlich eingeordnet. Bestehende Datensätze bleiben bewusst NULL, da deren
-- tatsächlicher Nutzungskontext rückwirkend nicht zuverlässig bestimmbar ist.

ALTER TABLE software_ratings
    ADD COLUMN IF NOT EXISTS experience_level varchar(24);

ALTER TABLE community_posts
    ADD COLUMN IF NOT EXISTS software_experience_level varchar(24);

ALTER TABLE directory_provider_reviews
    ADD COLUMN IF NOT EXISTS experience_level varchar(24);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'software_ratings_experience_level_check'
    ) THEN
        ALTER TABLE software_ratings
            ADD CONSTRAINT software_ratings_experience_level_check
            CHECK (experience_level IS NULL OR experience_level IN ('in_use', 'evaluated', 'general'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'community_posts_software_experience_level_check'
    ) THEN
        ALTER TABLE community_posts
            ADD CONSTRAINT community_posts_software_experience_level_check
            CHECK (
                software_experience_level IS NULL
                OR (
                    software_tool_id IS NOT NULL
                    AND software_experience_level IN ('in_use', 'evaluated', 'general')
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'directory_provider_reviews_experience_level_check'
    ) THEN
        ALTER TABLE directory_provider_reviews
            ADD CONSTRAINT directory_provider_reviews_experience_level_check
            CHECK (experience_level IS NULL OR experience_level IN ('in_use', 'evaluated', 'general'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_software_ratings_tenant_experience
    ON software_ratings (business_partner_id, software_tool_id, experience_level);

CREATE INDEX IF NOT EXISTS idx_directory_reviews_experience
    ON directory_provider_reviews (provider_id, experience_level);

COMMENT ON COLUMN software_ratings.experience_level IS
    'Nutzungskontext: in_use, evaluated oder general; NULL nur für Altbestand.';

COMMENT ON COLUMN community_posts.software_experience_level IS
    'Nutzungskontext eines neuen Software-Erfahrungsbeitrags.';

COMMENT ON COLUMN directory_provider_reviews.experience_level IS
    'Nutzungskontext: in_use, evaluated oder general; NULL nur für Altbestand.';
