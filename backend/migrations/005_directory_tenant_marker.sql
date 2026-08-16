ALTER TABLE directory_provider_mandant_settings
    ADD COLUMN IF NOT EXISTS is_tenant_entry BOOLEAN NOT NULL DEFAULT FALSE;

WITH tenant_candidates AS (
    SELECT
        dpm.provider_id,
        dpm.business_partner_id,
        ROW_NUMBER() OVER (
            PARTITION BY dpm.business_partner_id
            ORDER BY dpm.is_recommended DESC, p.name ASC, dpm.provider_id
        ) AS candidate_rank
    FROM directory_provider_mandant_settings dpm
    JOIN directory_providers p ON p.id = dpm.provider_id
    JOIN business_partners bp ON bp.id = dpm.business_partner_id
    WHERE dpm.status = 'active'
      AND LOWER(BTRIM(p.name)) = LOWER(BTRIM(bp.name))
)
UPDATE directory_provider_mandant_settings dpm
SET is_tenant_entry = TRUE
FROM tenant_candidates candidate
WHERE dpm.provider_id = candidate.provider_id
  AND dpm.business_partner_id = candidate.business_partner_id
  AND candidate.candidate_rank = 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_directory_tenant_entry_per_partner
    ON directory_provider_mandant_settings (business_partner_id)
    WHERE is_tenant_entry = TRUE;
