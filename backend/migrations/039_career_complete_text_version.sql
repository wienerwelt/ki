-- v3 berücksichtigt Titel, Kurztext und Volltext gemeinsam. Erfolgreiche
-- frühere Extraktionen bleiben gültig; nur frühere Ausschlüsse werden erneut
-- durch den verbesserten Vorfilter geschickt.
UPDATE career_article_checks checks
SET prompt_version = 'career-v3'
WHERE EXISTS (
    SELECT 1
    FROM career_extractions extraction
    WHERE extraction.content_hash = checks.content_hash
      AND extraction.prompt_version IN ('career-v1', 'career-v2')
      AND extraction.status = 'completed'
);

