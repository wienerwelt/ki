-- Preismodelle auf wenige, vergleichbare Hauptgruppen vereinheitlichen.
UPDATE software_tools
SET pricing_model = CASE
    WHEN pricing_model IS NULL OR BTRIM(pricing_model) = '' THEN NULL
    WHEN pricing_model IN ('Kostenlos', 'Freemium', 'Abonnement', 'Nutzungsabhängig', 'Auf Anfrage') THEN pricing_model
    WHEN pricing_model IN ('Lizenz', 'Einmalkauf', 'Lizenz / Auf Anfrage') THEN 'Einmalkauf / Lizenz'
    WHEN pricing_model IN ('Pro Nutzer', 'Pro Fahrzeug', 'Pro Standort', 'Abonnement / Auf Anfrage') THEN 'Abonnement'
    WHEN pricing_model IN ('Transaktionsabhängig', 'Modulabhängig', 'Dienstabhängig', 'Abonnement / Transaktionsabhängig') THEN 'Nutzungsabhängig'
    ELSE 'Auf Anfrage'
END,
updated_at = CURRENT_TIMESTAMP
WHERE pricing_model IS NOT NULL
  AND pricing_model NOT IN ('Kostenlos', 'Freemium', 'Abonnement', 'Einmalkauf / Lizenz', 'Nutzungsabhängig', 'Auf Anfrage');
