-- Sales-Trigger können entweder reine Markt-/Ereignissignale oder
-- accountbezogene Signale für alle bzw. ausgewählte Accounts erzeugen.
ALTER TABLE account_radar_trigger_profiles
    ADD COLUMN IF NOT EXISTS scope_mode TEXT NOT NULL DEFAULT 'all';

UPDATE account_radar_trigger_profiles
SET scope_mode = CASE
    WHEN cardinality(account_ids) > 0 THEN 'selected'
    ELSE 'all'
END
WHERE scope_mode IS NULL OR scope_mode NOT IN ('unassigned', 'all', 'selected');

ALTER TABLE account_radar_trigger_profiles
    DROP CONSTRAINT IF EXISTS account_radar_trigger_profiles_scope_mode_check;

ALTER TABLE account_radar_trigger_profiles
    ADD CONSTRAINT account_radar_trigger_profiles_scope_mode_check
    CHECK (scope_mode IN ('unassigned', 'all', 'selected'));

ALTER TABLE account_radar_content_trigger_matches
    ALTER COLUMN account_id DROP NOT NULL;

DROP INDEX IF EXISTS account_radar_content_trigger_matches_unique;

CREATE UNIQUE INDEX account_radar_content_trigger_matches_unique
    ON account_radar_content_trigger_matches (
        trigger_profile_id,
        scraped_content_id,
        COALESCE(account_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(competitor_name, '')
    );

CREATE INDEX IF NOT EXISTS account_radar_content_trigger_matches_market_idx
    ON account_radar_content_trigger_matches (business_partner_id, created_at DESC)
    WHERE account_id IS NULL;
