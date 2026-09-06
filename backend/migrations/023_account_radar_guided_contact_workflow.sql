-- Geführter Kontakt-Workflow: Ansprechpartner und Kanal an der Radar-Aufgabe speichern.
ALTER TABLE account_radar_tasks
    ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES business_partner_account_contacts(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS contact_channel TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'account_radar_tasks_contact_channel_check'
          AND conrelid = 'account_radar_tasks'::regclass
    ) THEN
        ALTER TABLE account_radar_tasks
            ADD CONSTRAINT account_radar_tasks_contact_channel_check
            CHECK (
                contact_channel IS NULL
                OR contact_channel IN ('email', 'phone', 'linkedin', 'video_call', 'in_person', 'contact_form', 'other')
            );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS account_radar_tasks_contact_idx
    ON account_radar_tasks(contact_id)
    WHERE contact_id IS NOT NULL;
