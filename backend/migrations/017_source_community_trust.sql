-- Community-Trust ist von der redaktionellen Freigabe getrennt:
-- Freigabe steuert die Veröffentlichung, Bewertungen bleiben dauerhaft änderbar.

CREATE TABLE IF NOT EXISTS source_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE source_votes
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Falls eine ältere Installation doppelte Stimmen enthält, bleibt die neueste erhalten.
WITH ranked_votes AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY source_id, user_id
               ORDER BY COALESCE(updated_at, created_at) DESC, id DESC
           ) AS row_number
    FROM source_votes
)
DELETE FROM source_votes
WHERE id IN (SELECT id FROM ranked_votes WHERE row_number > 1);

CREATE UNIQUE INDEX IF NOT EXISTS source_votes_source_user_uq
    ON source_votes(source_id, user_id);

CREATE INDEX IF NOT EXISTS source_votes_source_idx
    ON source_votes(source_id);

CREATE INDEX IF NOT EXISTS source_votes_user_idx
    ON source_votes(user_id);

-- Bestehende SOURCE_VOTE-Logs aus der bisherigen Implementierung übernehmen.
WITH latest_legacy_votes AS (
    SELECT DISTINCT ON (logs.reference_id, logs.user_id)
           logs.reference_id AS source_id,
           logs.user_id,
           logs.rating,
           logs.comment,
           logs.created_at
    FROM user_score_logs logs
    JOIN sources source ON source.id = logs.reference_id
    JOIN users app_user ON app_user.id = logs.user_id
    WHERE logs.action_type = 'SOURCE_VOTE'
      AND logs.rating BETWEEN 1 AND 5
    ORDER BY logs.reference_id, logs.user_id, logs.created_at DESC
)
INSERT INTO source_votes (source_id, user_id, rating, comment, created_at, updated_at)
SELECT source_id, user_id, rating, comment, created_at, created_at
FROM latest_legacy_votes
ON CONFLICT (source_id, user_id) DO UPDATE
SET rating = EXCLUDED.rating,
    comment = EXCLUDED.comment,
    updated_at = EXCLUDED.updated_at
WHERE EXCLUDED.updated_at > source_votes.updated_at;

-- Aggregierte Werte einmalig aus der kanonischen Bewertungstabelle korrigieren.
UPDATE sources source
SET vote_count = aggregates.vote_count,
    average_rating = aggregates.average_rating,
    updated_at = CURRENT_TIMESTAMP
FROM (
    SELECT votes.source_id,
           COUNT(*)::INTEGER AS vote_count,
           ROUND((
               SUM(votes.rating * (1 + GREATEST(COALESCE(app_user.contribution_score, 0), 0) / 100.0))
               / NULLIF(SUM(1 + GREATEST(COALESCE(app_user.contribution_score, 0), 0) / 100.0), 0)
           )::NUMERIC, 2) AS average_rating
    FROM source_votes votes
    JOIN users app_user ON app_user.id = votes.user_id
    GROUP BY votes.source_id
) aggregates
WHERE source.id = aggregates.source_id;

UPDATE sources source
SET vote_count = 0,
    average_rating = 0,
    updated_at = CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM source_votes votes WHERE votes.source_id = source.id
)
AND (source.vote_count <> 0 OR source.average_rating <> 0);
