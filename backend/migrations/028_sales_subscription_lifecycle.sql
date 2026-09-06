ALTER TABLE business_partners
    ADD COLUMN IF NOT EXISTS sales_subscription_status TEXT NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS sales_trial_ends_on DATE,
    ADD COLUMN IF NOT EXISTS sales_monthly_price_eur NUMERIC(10, 2),
    ADD COLUMN IF NOT EXISTS sales_billing_cycle TEXT NOT NULL DEFAULT 'monthly';

ALTER TABLE business_partners
    DROP CONSTRAINT IF EXISTS business_partners_sales_subscription_status_check,
    DROP CONSTRAINT IF EXISTS business_partners_sales_trial_date_check,
    DROP CONSTRAINT IF EXISTS business_partners_sales_monthly_price_check,
    DROP CONSTRAINT IF EXISTS business_partners_sales_billing_cycle_check;

ALTER TABLE business_partners
    ADD CONSTRAINT business_partners_sales_subscription_status_check
        CHECK (sales_subscription_status IN ('active', 'trial', 'paused')),
    ADD CONSTRAINT business_partners_sales_trial_date_check
        CHECK (sales_subscription_status <> 'trial' OR sales_trial_ends_on IS NOT NULL),
    ADD CONSTRAINT business_partners_sales_monthly_price_check
        CHECK (sales_monthly_price_eur IS NULL OR sales_monthly_price_eur >= 0),
    ADD CONSTRAINT business_partners_sales_billing_cycle_check
        CHECK (sales_billing_cycle IN ('monthly', 'annual'));

