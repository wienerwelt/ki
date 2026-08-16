INSERT INTO directory_provider_mandant_settings (
    provider_id,
    business_partner_id,
    status,
    is_recommended,
    is_tenant_entry
)
SELECT
    matching_provider.id,
    bp.id,
    'active',
    FALSE,
    TRUE
FROM business_partners bp
JOIN LATERAL (
    SELECT p.id
    FROM directory_providers p
    WHERE LOWER(BTRIM(p.name)) = LOWER(BTRIM(bp.name))
    ORDER BY p.is_public DESC, p.created_at ASC, p.id
    LIMIT 1
) matching_provider ON TRUE
WHERE bp.is_active = TRUE
  AND NOT EXISTS (
      SELECT 1
      FROM directory_provider_mandant_settings existing_tenant_entry
      WHERE existing_tenant_entry.business_partner_id = bp.id
        AND existing_tenant_entry.is_tenant_entry = TRUE
  )
  AND NOT EXISTS (
      SELECT 1
      FROM directory_provider_mandant_settings existing_relation
      WHERE existing_relation.business_partner_id = bp.id
        AND existing_relation.provider_id = matching_provider.id
  );
