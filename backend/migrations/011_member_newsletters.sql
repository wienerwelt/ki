-- Zeitlich aktive Mitglieder können zusätzlich zum Branchenbriefing eine
-- redaktionelle Mitglieder-Mail erhalten. Bestehende, bestätigte allgemeine
-- Newsletter-Einwilligungen werden als Ausgangswert übernommen.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS member_newsletter_enabled boolean NOT NULL DEFAULT FALSE;

UPDATE users
SET member_newsletter_enabled = TRUE
WHERE newsletter_opt_in = TRUE
  AND newsletter_opt_in_confirmed_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS member_newsletter_campaigns (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_partner_id uuid NOT NULL REFERENCES business_partners (id) ON DELETE CASCADE,
    created_by uuid REFERENCES users (id) ON DELETE SET NULL,
    subject varchar(200) NOT NULL,
    preheader varchar(300),
    body_text text NOT NULL,
    cta_label varchar(80),
    cta_url text,
    status varchar(20) NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'sending', 'sent', 'failed')),
    recipient_filter jsonb NOT NULL DEFAULT '{}'::jsonb,
    recipient_count integer NOT NULL DEFAULT 0,
    sent_count integer NOT NULL DEFAULT 0,
    skipped_count integer NOT NULL DEFAULT 0,
    failed_count integer NOT NULL DEFAULT 0,
    delivery_mode varchar(20),
    error_message text,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    queued_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_member_newsletter_campaigns_partner_created
    ON member_newsletter_campaigns (business_partner_id, created_at DESC);
