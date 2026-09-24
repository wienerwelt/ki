-- Accountlose Markt- und Ereignistreffer erhalten einen eigenen, mandantenbezogenen
-- Prüfstatus. Bei der Zuordnung zu einem Account wechseln sie in den bestehenden Radar.
ALTER TABLE account_radar_content_trigger_matches
    ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'new',
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reviewed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

UPDATE account_radar_content_trigger_matches
SET review_status = 'assigned'
WHERE account_id IS NOT NULL
  AND review_status = 'new';

ALTER TABLE account_radar_content_trigger_matches
    DROP CONSTRAINT IF EXISTS account_radar_content_trigger_matches_review_status_check;

ALTER TABLE account_radar_content_trigger_matches
    ADD CONSTRAINT account_radar_content_trigger_matches_review_status_check
    CHECK (review_status IN ('new', 'ignored', 'assigned'));

CREATE INDEX IF NOT EXISTS account_radar_content_trigger_matches_review_idx
    ON account_radar_content_trigger_matches (business_partner_id, review_status, created_at DESC)
    WHERE account_id IS NULL;
