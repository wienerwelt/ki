-- Benutzeridentitäten müssen unabhängig von Groß-/Kleinschreibung und
-- versehentlichen Leerzeichen eindeutig sein. Vorhandene Konflikte werden
-- bewusst nicht automatisch zusammengeführt, damit keine Konten oder Daten
-- unbemerkt verloren gehen.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM users
        GROUP BY lower(btrim(email))
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Doppelte Benutzer-E-Mail-Adressen (normalisiert) gefunden. Vor Migration 013 manuell prüfen.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM users
        GROUP BY lower(btrim(username))
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Doppelte Benutzernamen (normalisiert) gefunden. Vor Migration 013 manuell prüfen.';
    END IF;
END $$;

UPDATE users
SET email = lower(btrim(email)),
    username = btrim(username),
    updated_at = CURRENT_TIMESTAMP
WHERE email IS DISTINCT FROM lower(btrim(email))
   OR username IS DISTINCT FROM btrim(username);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_normalized_unique
    ON users (lower(btrim(email)));

CREATE UNIQUE INDEX IF NOT EXISTS users_username_normalized_unique
    ON users (lower(btrim(username)));
