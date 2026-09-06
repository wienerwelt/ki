const db = require('../config/db');

const buildTagPatterns = (question) => Array.from(new Set(
  String(question || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .map((value) => value.trim())
    .filter((value) => value.length >= 3)
    .slice(0, 12)
    .map((value) => `%${value}%`)
));

async function retrieveTenantInternalDocuments(question, businessPartnerId, limit = 8, options = {}) {
  const searchTerm = String(question || '').trim().slice(0, 1000);
  if (searchTerm.length < 3 || !businessPartnerId) return [];

  const safeLimit = Math.max(1, Math.min(Number(limit) || 8, 12));
  const tagPatterns = buildTagPatterns(searchTerm);
  const includeSalesSources = options?.includeSalesSources === true;
  const result = await db.query(`
    SELECT id, title, summary, type, url, relevance
    FROM (
      SELECT
        sc.id::text AS id,
        sc.title,
        COALESCE(sc.summary, '') AS summary,
        'scraped'::text AS type,
        sc.original_url::text AS url,
        ts_rank(
          to_tsvector('german', COALESCE(sc.title, '') || ' ' || COALESCE(sc.summary, '')),
          websearch_to_tsquery('german', $1)
        ) AS relevance
      FROM scraped_content sc
      WHERE to_tsvector('german', COALESCE(sc.title, '') || ' ' || COALESCE(sc.summary, ''))
              @@ websearch_to_tsquery('german', $1)
        AND (
          sc.category NOT IN ('businesspartner_news', 'businesspartner_events')
          OR sc.source_identifier = $2::text || '_news'
          OR sc.source_identifier = $2::text || '_events'
        )

      UNION ALL

      SELECT
        agc.id::text AS id,
        COALESCE(agc.title, 'KI-Inhalt') AS title,
        LEFT(COALESCE(agc.generated_output, ''), 6000) AS summary,
        'ai'::text AS type,
        agc.source_reference::text AS url,
        ts_rank(
          to_tsvector('german', COALESCE(agc.title, '') || ' ' || COALESCE(agc.generated_output, '')),
          websearch_to_tsquery('german', $1)
        ) AS relevance
      FROM ai_generated_content agc
      LEFT JOIN users ai_user ON ai_user.id = agc.user_id
      WHERE to_tsvector('german', COALESCE(agc.title, '') || ' ' || COALESCE(agc.generated_output, ''))
              @@ websearch_to_tsquery('german', $1)
        AND (agc.user_id IS NULL OR ai_user.business_partner_id = $2::uuid)

      UNION ALL

      SELECT
        bpta.id::text AS id,
        bpta.article_title AS title,
        COALESCE(bpta.summary, '') AS summary,
        'tracked_account_news'::text AS type,
        bpta.article_url::text AS url,
        ts_rank(
          to_tsvector('german', COALESCE(bpta.article_title, '') || ' ' || COALESCE(bpta.summary, '')),
          websearch_to_tsquery('german', $1)
        ) AS relevance
      FROM business_partner_tracked_articles bpta
      JOIN business_partner_accounts bpa ON bpa.id = bpta.account_id
      WHERE $5::boolean = true
        AND bpa.business_partner_id = $2::uuid
        AND to_tsvector('german', COALESCE(bpta.article_title, '') || ' ' || COALESCE(bpta.summary, ''))
              @@ websearch_to_tsquery('german', $1)

      UNION ALL

      SELECT
        task.id::text AS id,
        'Sales-Aufgabe: ' || account.name AS title,
        CONCAT_WS(
          E'\n',
          'Account: ' || account.name,
          'Signal: ' || tracked.article_title,
          CASE task.sales_stage
            WHEN 'contacted' THEN 'Vertriebsphase: Kontaktiert'
            WHEN 'meeting' THEN 'Vertriebsphase: Termin vereinbart'
            WHEN 'offer' THEN 'Vertriebsphase: Angebot'
            WHEN 'won' THEN 'Vertriebsphase: Gewonnen'
            WHEN 'lost' THEN 'Vertriebsphase: Verloren'
            ELSE NULL
          END,
          'Aufgabenstatus: ' || CASE task.task_status WHEN 'done' THEN 'erledigt' ELSE 'offen' END,
          CASE
            WHEN assigned.id IS NOT NULL THEN 'Verantwortlich: ' || COALESCE(
              NULLIF(TRIM(CONCAT_WS(' ', assigned.first_name, assigned.last_name)), ''),
              assigned.username
            )
            ELSE 'Verantwortlich: nicht zugewiesen'
          END,
          CASE WHEN contact.id IS NOT NULL THEN 'Ansprechpartner: ' || contact.name || COALESCE(' (' || NULLIF(TRIM(contact.job_title), '') || ')', '') ELSE NULL END,
          CASE task.contact_channel
            WHEN 'email' THEN 'Kontaktkanal: E-Mail'
            WHEN 'phone' THEN 'Kontaktkanal: Telefon'
            WHEN 'linkedin' THEN 'Kontaktkanal: LinkedIn'
            WHEN 'video_call' THEN 'Kontaktkanal: Video-Call'
            WHEN 'in_person' THEN 'Kontaktkanal: Persönlich'
            WHEN 'contact_form' THEN 'Kontaktkanal: Kontaktformular'
            WHEN 'other' THEN 'Kontaktkanal: Sonstiger Kanal'
            ELSE NULL
          END,
          CASE WHEN task.follow_up_at IS NOT NULL THEN 'Termin: ' || TO_CHAR(task.follow_up_at AT TIME ZONE 'Europe/Vienna', 'DD.MM.YYYY HH24:MI') ELSE NULL END,
          CASE WHEN NULLIF(TRIM(task.note), '') IS NOT NULL THEN 'Interne Notiz: ' || task.note ELSE NULL END
        ) AS summary,
        'account_radar_task'::text AS type,
        '/radar'::text AS url,
        2.5::real AS relevance
      FROM account_radar_tasks task
      JOIN business_partner_tracked_articles tracked ON tracked.id = task.tracked_article_id
      JOIN business_partner_accounts account ON account.id = tracked.account_id
      LEFT JOIN users assigned ON assigned.id = task.assigned_user_id
      LEFT JOIN business_partner_account_contacts contact
        ON contact.id = task.contact_id
       AND contact.account_id = account.id
      WHERE $5::boolean = true
        AND account.business_partner_id = $2::uuid
        AND task.business_partner_id = $2::uuid
        AND task.task_status <> 'cancelled'
        AND (
          to_tsvector(
            'german',
            COALESCE(account.name, '') || ' ' || COALESCE(tracked.article_title, '') || ' ' ||
            COALESCE(task.note, '') || ' ' || COALESCE(task.sales_stage, '') || ' ' ||
            COALESCE(contact.name, '') || ' ' || COALESCE(task.contact_channel, '') || ' ' ||
            CASE task.task_status WHEN 'done' THEN 'erledigt abgeschlossen' ELSE 'offen aktuell' END
          ) @@ websearch_to_tsquery('german', $1)
          OR (
            cardinality($3::text[]) > 0
            AND (
              account.name ILIKE ANY($3::text[])
              OR tracked.article_title ILIKE ANY($3::text[])
              OR task.note ILIKE ANY($3::text[])
              OR contact.name ILIKE ANY($3::text[])
            )
          )
        )

      UNION ALL

      SELECT
        bpf.id::text AS id,
        bpf.filename AS title,
        COALESCE(bpf.description, 'Datei im Dateimanager') AS summary,
        'file'::text AS type,
        '/files'::text AS url,
        ts_rank(
          to_tsvector(
            'german',
            COALESCE(bpf.filename, '') || ' ' || COALESCE(bpf.description, '') || ' ' ||
            COALESCE(array_to_string(bpf.tags, ' '), '')
          ),
          websearch_to_tsquery('german', $1)
        ) AS relevance
      FROM business_partner_files bpf
      WHERE bpf.business_partner_id = $2::uuid
        AND to_tsvector(
          'german',
          COALESCE(bpf.filename, '') || ' ' || COALESCE(bpf.description, '') || ' ' ||
          COALESCE(array_to_string(bpf.tags, ' '), '')
        ) @@ websearch_to_tsquery('german', $1)

      UNION ALL

      SELECT
        cp.id::text AS id,
        'Community-Beitrag'::text AS title,
        LEFT(COALESCE(cp.content, ''), 6000) AS summary,
        'community_post'::text AS type,
        '/community'::text AS url,
        ts_rank(
          to_tsvector('german', COALESCE(cp.content, '')),
          websearch_to_tsquery('german', $1)
        ) AS relevance
      FROM community_posts cp
      WHERE cp.business_partner_id = $2::uuid
        AND to_tsvector('german', COALESCE(cp.content, ''))
              @@ websearch_to_tsquery('german', $1)

      UNION ALL

      SELECT
        pad.id::text AS id,
        COALESCE(pad.title, 'Mandanten-Homepage') AS title,
        pad.content AS summary,
        'tenant_homepage'::text AS type,
        pad.canonical_url::text AS url,
        ts_rank(
          to_tsvector('german', COALESCE(pad.title, '') || ' ' || COALESCE(pad.content, '')),
          websearch_to_tsquery('german', $1)
        ) AS relevance
      FROM public_ai_documents pad
      WHERE pad.business_partner_id = $2::uuid
        AND pad.is_active = true
        AND (
          to_tsvector('german', COALESCE(pad.title, '') || ' ' || COALESCE(pad.content, ''))
            @@ websearch_to_tsquery('german', $1)
          OR (
            cardinality($3::text[]) > 0
            AND (pad.title ILIKE ANY($3::text[]) OR pad.content ILIKE ANY($3::text[]))
          )
        )

      UNION ALL

      SELECT
        u.id::text AS id,
        'Experte: ' || COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '') AS title,
        'Expertise in: ' || string_agg(DISTINCT ust.tag_name, ', ') AS summary,
        'user'::text AS type,
        '/community'::text AS url,
        2.0::real AS relevance
      FROM users u
      JOIN user_saved_tags ust ON ust.user_id = u.id
      WHERE u.business_partner_id = $2::uuid
        AND u.is_active = true
        AND cardinality($3::text[]) > 0
        AND ust.tag_name ILIKE ANY($3::text[])
      GROUP BY u.id, u.first_name, u.last_name
    ) AS tenant_results
    ORDER BY relevance DESC
    LIMIT $4
  `, [searchTerm, businessPartnerId, tagPatterns, safeLimit, includeSalesSources]);

  return result.rows;
}

module.exports = {
  retrieveTenantInternalDocuments,
  __test: { buildTagPatterns },
};
