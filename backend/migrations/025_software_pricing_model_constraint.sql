-- Einheitliche Preismodelle auch bei direkten oder zukünftigen Importen erzwingen.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'software_tools_pricing_model_check'
          AND conrelid = 'software_tools'::regclass
    ) THEN
        ALTER TABLE software_tools
            ADD CONSTRAINT software_tools_pricing_model_check
            CHECK (
                pricing_model IS NULL
                OR pricing_model IN (
                    'Kostenlos',
                    'Freemium',
                    'Abonnement',
                    'Einmalkauf / Lizenz',
                    'Nutzungsabhängig',
                    'Auf Anfrage'
                )
            );
    END IF;
END $$;
