-- Zentrale Account-Detaildaten und mandantenspezifische Ansprechpartner.
ALTER TABLE business_partner_accounts
    ADD COLUMN IF NOT EXISTS logo_url TEXT,
    ADD COLUMN IF NOT EXISTS address TEXT,
    ADD COLUMN IF NOT EXISTS contact_email TEXT,
    ADD COLUMN IF NOT EXISTS contact_phone TEXT;

CREATE TABLE IF NOT EXISTS business_partner_account_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES business_partner_accounts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    job_title TEXT,
    email TEXT,
    phone TEXT,
    linkedin_url TEXT,
    notes TEXT,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT business_partner_account_contacts_name_length_check
        CHECK (char_length(TRIM(name)) BETWEEN 1 AND 200),
    CONSTRAINT business_partner_account_contacts_job_title_length_check
        CHECK (job_title IS NULL OR char_length(job_title) <= 200),
    CONSTRAINT business_partner_account_contacts_email_length_check
        CHECK (email IS NULL OR char_length(email) <= 320),
    CONSTRAINT business_partner_account_contacts_phone_length_check
        CHECK (phone IS NULL OR char_length(phone) <= 80),
    CONSTRAINT business_partner_account_contacts_notes_length_check
        CHECK (notes IS NULL OR char_length(notes) <= 2000)
);

CREATE INDEX IF NOT EXISTS business_partner_account_contacts_account_idx
    ON business_partner_account_contacts(account_id, is_primary DESC, name);

CREATE UNIQUE INDEX IF NOT EXISTS business_partner_account_contacts_one_primary_idx
    ON business_partner_account_contacts(account_id)
    WHERE is_primary = TRUE;
