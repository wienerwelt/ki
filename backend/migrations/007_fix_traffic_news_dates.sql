-- Verkehrsrundschau liefert deutsche Datumswerte wie 12.06.2026. Ohne
-- explizites Format interpretiert JavaScript diese als MM.DD.YYYY.
UPDATE scraping_rules
SET date_format = 'd.M.yyyy',
    updated_at = CURRENT_TIMESTAMP
WHERE source_identifier = 'verkehrsrundschau_de_news'
  AND COALESCE(BTRIM(date_format), '') = '';

-- Bereits gespeicherte, offensichtlich vertauschte Werte korrigieren. Eine
-- Korrektur erfolgt nur, wenn das getauschte Datum plausibel nahe am
-- Importzeitpunkt liegt und nicht nach dem Import liegt.
WITH date_candidates AS (
    SELECT
        id,
        published_date AS current_date,
        scraped_at::date AS scraped_date,
        make_date(
            EXTRACT(YEAR FROM published_date)::integer,
            EXTRACT(DAY FROM published_date)::integer,
            EXTRACT(MONTH FROM published_date)::integer
        ) AS corrected_date
    FROM scraped_content
    WHERE source_identifier = 'verkehrsrundschau_de_news'
      AND published_date IS NOT NULL
)
UPDATE scraped_content content
SET published_date = candidate.corrected_date,
    updated_at = CURRENT_TIMESTAMP
FROM date_candidates candidate
WHERE content.id = candidate.id
  AND candidate.corrected_date <= candidate.scraped_date + 1
  AND ABS(candidate.scraped_date - candidate.corrected_date)
      < ABS(candidate.scraped_date - candidate.current_date);
