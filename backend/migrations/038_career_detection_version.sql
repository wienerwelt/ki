ALTER TABLE career_article_checks
    ADD COLUMN IF NOT EXISTS prompt_version text NOT NULL DEFAULT 'career-v1';

-- Bereits erfolgreich extrahierte Inhalte müssen durch die erweiterte
-- Signalerkennung nicht nochmals kostenpflichtig analysiert werden. Frühere
-- Ausschlüsse bleiben dagegen auf v1 und können mit v2 erneut geprüft werden.
UPDATE career_article_checks checks
SET prompt_version = 'career-v2'
WHERE EXISTS (
    SELECT 1
    FROM career_extractions extraction
    WHERE extraction.content_hash = checks.content_hash
      AND extraction.prompt_version = 'career-v1'
      AND extraction.status = 'completed'
);

