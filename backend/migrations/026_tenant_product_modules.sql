ALTER TABLE business_partners
    ADD COLUMN IF NOT EXISTS enabled_modules TEXT[] NOT NULL DEFAULT ARRAY['content']::TEXT[],
    ADD COLUMN IF NOT EXISTS default_workspace TEXT NOT NULL DEFAULT 'content';

-- Vorhandene Mandanten konnten den Account-Radar bereits verwenden. Deshalb
-- bleibt dieser Zugriff beim Update erhalten; neue Mandanten starten mit Content.
UPDATE business_partners
SET enabled_modules = ARRAY['content', 'sales']::TEXT[]
WHERE enabled_modules = ARRAY['content']::TEXT[];

UPDATE business_partners
SET default_workspace = CASE
    WHEN LOWER(COALESCE(dashboard_focus, 'information')) = 'sales' THEN 'sales'
    ELSE 'content'
END;

ALTER TABLE business_partners
    DROP CONSTRAINT IF EXISTS business_partners_enabled_modules_check,
    DROP CONSTRAINT IF EXISTS business_partners_default_workspace_check;

ALTER TABLE business_partners
    ADD CONSTRAINT business_partners_enabled_modules_check
        CHECK (
            cardinality(enabled_modules) > 0
            AND enabled_modules <@ ARRAY['content', 'sales']::TEXT[]
        ),
    ADD CONSTRAINT business_partners_default_workspace_check
        CHECK (
            default_workspace IN ('content', 'sales')
            AND default_workspace = ANY(enabled_modules)
        );

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS preferred_workspace TEXT;

ALTER TABLE users
    DROP CONSTRAINT IF EXISTS users_preferred_workspace_check;

ALTER TABLE users
    ADD CONSTRAINT users_preferred_workspace_check
        CHECK (preferred_workspace IS NULL OR preferred_workspace IN ('content', 'sales'));

DO $$
BEGIN
    IF to_regclass('public.roles') IS NOT NULL THEN
        INSERT INTO roles (name, description)
        VALUES
            ('sales_manager', 'Verwaltet Accounts, Radar-Einstellungen und das Sales-Team des eigenen Mandanten.'),
            ('sales_user', 'Bearbeitet Account-Signale und persönliche beziehungsweise zugewiesene Sales-Aufgaben.')
        ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description;
    END IF;
END
$$;

