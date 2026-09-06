-- Persönliche Vertriebsplanung je Nutzer und Account-Radar-Signal.
ALTER TABLE account_intelligence_item_status
    ADD COLUMN IF NOT EXISTS action_type TEXT,
    ADD COLUMN IF NOT EXISTS follow_up_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS note TEXT,
    ADD COLUMN IF NOT EXISTS action_updated_at TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'account_intelligence_item_status_action_type_check'
          AND conrelid = 'account_intelligence_item_status'::regclass
    ) THEN
        ALTER TABLE account_intelligence_item_status
            ADD CONSTRAINT account_intelligence_item_status_action_type_check
            CHECK (action_type IS NULL OR action_type IN ('contact_planned', 'follow_up'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'account_intelligence_item_status_note_length_check'
          AND conrelid = 'account_intelligence_item_status'::regclass
    ) THEN
        ALTER TABLE account_intelligence_item_status
            ADD CONSTRAINT account_intelligence_item_status_note_length_check
            CHECK (note IS NULL OR char_length(note) <= 1500);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS account_intelligence_item_status_follow_up_idx
    ON account_intelligence_item_status(user_id, follow_up_at)
    WHERE follow_up_at IS NOT NULL AND status IN ('new', 'read');
