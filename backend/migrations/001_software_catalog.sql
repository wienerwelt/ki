CREATE TABLE IF NOT EXISTS software_categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug varchar(100) NOT NULL UNIQUE,
    name varchar(150) NOT NULL,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO software_categories (slug, name, sort_order) VALUES
    ('telematik', 'Telematik', 10),
    ('fleetmanagement-verwaltung', 'Fleetmanagement / Verwaltung', 20),
    ('fuehrerscheinkontrolle', 'Führerscheinkontrolle', 30),
    ('fahrertraining-coaching', 'Trainings & Fahrer-Coaching', 40),
    ('tankstellenfinder', 'Tankstellenfinder', 50),
    ('ladeinfrastruktur', 'Ladeinfrastruktur & Energiemanagement', 60),
    ('routenplanung-disposition', 'Routenplanung & Disposition', 70),
    ('fahrtenbuch-compliance', 'Fahrtenbuch & Compliance', 80),
    ('wartung-schaden', 'Wartung & Schadenmanagement', 90),
    ('kosten-tco', 'Kostenmanagement & TCO', 100),
    ('leasing-beschaffung', 'Leasing & Beschaffung', 110),
    ('versicherung-risiko', 'Versicherung & Risikomanagement', 120),
    ('reifenmanagement', 'Reifenmanagement', 130),
    ('maut-vignette-parken', 'Maut, Vignette & Parken', 140),
    ('carsharing-poolfahrzeuge', 'Carsharing & Poolfahrzeuge', 150),
    ('nachhaltigkeit-co2', 'Nachhaltigkeit & CO₂', 160),
    ('dashcams-sicherheit', 'Dashcams & Fahrersicherheit', 170),
    ('datenintegration-api', 'Datenintegration & APIs', 180),
    ('ki-automatisierung', 'KI & Automatisierung', 190)
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    sort_order = EXCLUDED.sort_order;

CREATE TABLE IF NOT EXISTS software_tools (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_partner_id uuid NOT NULL,
    provider_id uuid NOT NULL,
    name varchar(255) NOT NULL,
    short_description varchar(500),
    description text,
    product_url varchar(2048),
    logo_url varchar(2048),
    coverage_scope varchar(20) NOT NULL DEFAULT 'country',
    country_codes text[] NOT NULL DEFAULT '{}',
    deployment_model varchar(100),
    pricing_model varchar(100),
    target_group varchar(255),
    status varchar(20) NOT NULL DEFAULT 'draft',
    is_active boolean NOT NULL DEFAULT true,
    is_public boolean NOT NULL DEFAULT false,
    is_featured boolean NOT NULL DEFAULT false,
    created_by_user_id uuid,
    updated_by_user_id uuid,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT software_tools_scope_check
        CHECK (coverage_scope IN ('country', 'europe', 'worldwide')),
    CONSTRAINT software_tools_status_check
        CHECK (status IN ('draft', 'published', 'archived')),
    CONSTRAINT software_tools_country_codes_check
        CHECK (coverage_scope <> 'country' OR cardinality(country_codes) > 0),
    CONSTRAINT software_tools_provider_tenant_fkey
        FOREIGN KEY (provider_id, business_partner_id)
        REFERENCES directory_provider_mandant_settings (provider_id, business_partner_id)
        ON DELETE RESTRICT,
    CONSTRAINT software_tools_business_partner_fkey
        FOREIGN KEY (business_partner_id) REFERENCES business_partners (id) ON DELETE CASCADE,
    CONSTRAINT software_tools_created_by_fkey
        FOREIGN KEY (created_by_user_id) REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT software_tools_updated_by_fkey
        FOREIGN KEY (updated_by_user_id) REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT software_tools_provider_name_unique
        UNIQUE (business_partner_id, provider_id, name),
    CONSTRAINT software_tools_identity_tenant_unique
        UNIQUE (id, provider_id, business_partner_id),
    CONSTRAINT software_tools_identity_bp_unique
        UNIQUE (id, business_partner_id)
);

CREATE INDEX IF NOT EXISTS idx_software_tools_tenant_status
    ON software_tools (business_partner_id, status, is_active, is_public);
CREATE INDEX IF NOT EXISTS idx_software_tools_provider
    ON software_tools (provider_id, business_partner_id);
CREATE INDEX IF NOT EXISTS idx_software_tools_countries_gin
    ON software_tools USING gin (country_codes);

CREATE TABLE IF NOT EXISTS software_tool_categories (
    software_tool_id uuid NOT NULL REFERENCES software_tools (id) ON DELETE CASCADE,
    category_id uuid NOT NULL REFERENCES software_categories (id) ON DELETE RESTRICT,
    PRIMARY KEY (software_tool_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_software_tool_categories_category
    ON software_tool_categories (category_id, software_tool_id);

ALTER TABLE business_partner_actions
    ADD COLUMN IF NOT EXISTS directory_provider_id uuid,
    ADD COLUMN IF NOT EXISTS software_tool_id uuid;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'bp_actions_provider_tenant_fkey'
    ) THEN
        ALTER TABLE business_partner_actions
            ADD CONSTRAINT bp_actions_provider_tenant_fkey
            FOREIGN KEY (directory_provider_id, business_partner_id)
            REFERENCES directory_provider_mandant_settings (provider_id, business_partner_id)
            ON DELETE RESTRICT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'bp_actions_software_tenant_fkey'
    ) THEN
        ALTER TABLE business_partner_actions
            ADD CONSTRAINT bp_actions_software_tenant_fkey
            FOREIGN KEY (software_tool_id, directory_provider_id, business_partner_id)
            REFERENCES software_tools (id, provider_id, business_partner_id)
            ON DELETE RESTRICT;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bp_actions_directory_provider
    ON business_partner_actions (directory_provider_id, business_partner_id);
CREATE INDEX IF NOT EXISTS idx_bp_actions_software_tool
    ON business_partner_actions (software_tool_id, business_partner_id);

ALTER TABLE community_posts
    ADD COLUMN IF NOT EXISTS software_tool_id uuid,
    ADD COLUMN IF NOT EXISTS software_rating smallint;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'community_posts_software_tenant_fkey'
    ) THEN
        ALTER TABLE community_posts
            ADD CONSTRAINT community_posts_software_tenant_fkey
            FOREIGN KEY (software_tool_id, business_partner_id)
            REFERENCES software_tools (id, business_partner_id)
            ON DELETE RESTRICT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'community_posts_software_rating_check'
    ) THEN
        ALTER TABLE community_posts
            ADD CONSTRAINT community_posts_software_rating_check
            CHECK (
                software_rating IS NULL
                OR (software_tool_id IS NOT NULL AND software_rating BETWEEN 1 AND 5)
            );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_community_posts_software
    ON community_posts (business_partner_id, software_tool_id, created_at DESC)
    WHERE software_tool_id IS NOT NULL;

INSERT INTO categories (name, category_type)
SELECT 'Software & Tools', 'community'
WHERE NOT EXISTS (
    SELECT 1
    FROM categories
    WHERE category_type = 'community' AND lower(name) = lower('Software & Tools')
);

INSERT INTO widget_types (
    name,
    type_key,
    description,
    icon_name,
    is_removable,
    is_resizable,
    is_draggable,
    default_width,
    default_height,
    default_min_width,
    default_min_height,
    allowed_roles,
    config,
    component_key
)
VALUES (
    'Software-Lexikon',
    'SoftwareCatalog',
    'Mandantenspezifischer, anbietergebundener Software-Katalog mit Community-Erfahrungen.',
    'Apps',
    true,
    true,
    true,
    8,
    8,
    4,
    5,
    ARRAY['admin', 'assistenz', 'user', 'demo'],
    '{"title":"Software-Lexikon"}'::jsonb,
    'SoftwareCatalogWidget'
)
ON CONFLICT (type_key) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    icon_name = EXCLUDED.icon_name,
    allowed_roles = EXCLUDED.allowed_roles,
    config = EXCLUDED.config,
    component_key = EXCLUDED.component_key,
    updated_at = CURRENT_TIMESTAMP;
