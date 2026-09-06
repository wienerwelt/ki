ALTER TABLE business_partners
    ADD COLUMN IF NOT EXISTS sales_plan TEXT NOT NULL DEFAULT 'basic';

-- Alle bereits vorhandenen Sales-Mandanten behalten den bisherigen vollen
-- Funktionsumfang. Neue Mandanten starten bewusst mit Sales Basic.
UPDATE business_partners
SET sales_plan = 'premium'
WHERE 'sales' = ANY(COALESCE(enabled_modules, ARRAY['content']::TEXT[]));

ALTER TABLE business_partners
    DROP CONSTRAINT IF EXISTS business_partners_sales_plan_check;

ALTER TABLE business_partners
    ADD CONSTRAINT business_partners_sales_plan_check
        CHECK (sales_plan IN ('basic', 'premium'));

