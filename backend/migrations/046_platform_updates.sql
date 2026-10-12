CREATE TABLE IF NOT EXISTS platform_updates (
    id UUID PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    body TEXT NOT NULL,
    benefits TEXT,
    modules TEXT[] NOT NULL DEFAULT ARRAY['public_page']::TEXT[],
    image_url TEXT,
    action_required BOOLEAN NOT NULL DEFAULT FALSE,
    action_text TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    published_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT platform_updates_modules_check CHECK (
        modules <@ ARRAY['content', 'sales', 'community', 'public_page', 'admin']::TEXT[]
        AND cardinality(modules) > 0
    )
);

CREATE INDEX IF NOT EXISTS platform_updates_public_idx
    ON platform_updates (published_at DESC)
    WHERE status = 'published';
