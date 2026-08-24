-- Öffentliche Visitenkarten und einzelne Kontaktdaten werden nur nach
-- ausdrücklicher Freigabe durch den jeweiligen Nutzer ausgeliefert.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS public_profile_enabled boolean NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS show_email_publicly boolean NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS show_phone_publicly boolean NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS show_organization_publicly boolean NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS show_linkedin_publicly boolean NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN users.public_profile_enabled IS
    'Explizite Freigabe der öffentlichen digitalen Visitenkarte.';
COMMENT ON COLUMN users.show_email_publicly IS
    'E-Mail-Adresse auf der öffentlichen Visitenkarte anzeigen.';
COMMENT ON COLUMN users.show_phone_publicly IS
    'Telefonnummer auf der öffentlichen Visitenkarte anzeigen.';
COMMENT ON COLUMN users.show_organization_publicly IS
    'Eigene Organisation auf der öffentlichen Visitenkarte anzeigen.';
COMMENT ON COLUMN users.show_linkedin_publicly IS
    'LinkedIn-Link auf der öffentlichen Visitenkarte anzeigen.';
