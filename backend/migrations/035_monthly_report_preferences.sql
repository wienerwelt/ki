-- Administrative reports and marketing newsletters are independent.
-- Preserve existing eligibility on upgrade; do not create new subscriptions.
ALTER TABLE business_partners ADD COLUMN IF NOT EXISTS monthly_report_enabled boolean;
UPDATE business_partners
SET monthly_report_enabled = COALESCE(allow_automated_newsletter, FALSE)
WHERE monthly_report_enabled IS NULL;
ALTER TABLE business_partners ALTER COLUMN monthly_report_enabled SET DEFAULT FALSE;
ALTER TABLE business_partners ALTER COLUMN monthly_report_enabled SET NOT NULL;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS newsletter_email_enabled boolean NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS monthly_report_email_enabled boolean;
UPDATE users
SET monthly_report_email_enabled = (role IN ('assistenz', 'admin') AND COALESCE(newsletter_opt_in, FALSE))
WHERE monthly_report_email_enabled IS NULL;
ALTER TABLE users ALTER COLUMN monthly_report_email_enabled SET DEFAULT FALSE;
ALTER TABLE users ALTER COLUMN monthly_report_email_enabled SET NOT NULL;

COMMENT ON COLUMN users.newsletter_email_enabled IS
    'Admin delivery switch. Does not grant consent or override unsubscribe.';
COMMENT ON COLUMN users.monthly_report_email_enabled IS
    'Administrative monthly report recipient; independent of newsletter consent.';
