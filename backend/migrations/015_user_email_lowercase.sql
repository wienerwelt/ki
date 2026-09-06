-- Benutzer-E-Mail-Adressen werden unabhängig vom jeweiligen Anlage- oder
-- Importweg immer ohne Rand-Leerzeichen und in Kleinbuchstaben gespeichert.
-- Die Anwendung normalisiert bereits; dieser Trigger ist die letzte
-- Schutzschicht direkt an der Datenbank.
UPDATE users
SET email = lower(btrim(email)),
    updated_at = CURRENT_TIMESTAMP
WHERE email IS DISTINCT FROM lower(btrim(email));

CREATE OR REPLACE FUNCTION normalize_user_email_before_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.email := lower(btrim(NEW.email));
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_normalize_email_before_write ON users;

CREATE TRIGGER users_normalize_email_before_write
BEFORE INSERT OR UPDATE OF email ON users
FOR EACH ROW
EXECUTE FUNCTION normalize_user_email_before_write();
