-- Fehlgeschlagene Monatsreports bleiben für das operative Monitoring sichtbar
-- und können bei einem späteren Joblauf erneut beansprucht werden.
ALTER TABLE monthly_report_deliveries
    DROP CONSTRAINT IF EXISTS monthly_report_deliveries_status_check;

ALTER TABLE monthly_report_deliveries
    ADD CONSTRAINT monthly_report_deliveries_status_check
    CHECK (status IN ('sending', 'sent', 'failed'));

ALTER TABLE monthly_report_deliveries
    ADD COLUMN IF NOT EXISTS failed_at timestamptz,
    ADD COLUMN IF NOT EXISTS error_message text;

CREATE INDEX IF NOT EXISTS idx_monthly_report_deliveries_partner_month
    ON monthly_report_deliveries (business_partner_id, report_month DESC);

CREATE INDEX IF NOT EXISTS idx_monthly_report_deliveries_partner_status
    ON monthly_report_deliveries (business_partner_id, status);
