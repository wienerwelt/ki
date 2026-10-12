-- Zwölf redaktionelle Plattform-Updates für die im Oktober 2026 betreuten Mandanten.
-- Die stabilen Slugs machen die Anlage auch bei einer wiederholten Übernahme sicher.
INSERT INTO platform_updates (
    id, slug, title, summary, body, benefits, modules, image_url,
    action_required, action_text, status, audience_scope, published_at
)
VALUES
(
    '1f286f42-cf62-4765-a6cf-08d1cc470001',
    'digitale-visitenkarte-gezielt-freigeben-2026-09',
    'Digitale Visitenkarte: Ihr Profil für neue Kontakte',
    'Die digitale Visitenkarte bündelt Ihre wichtigsten Kontaktdaten und lässt sich gezielt öffentlich freigeben.',
    E'Mit der überarbeiteten digitalen Visitenkarte teilen Sie Ihre beruflichen Kontaktdaten übersichtlich über einen persönlichen Link. Die öffentliche Sichtbarkeit bleibt bewusst steuerbar: Erst nach Ihrer Freigabe ist die Karte außerhalb des geschützten Mitgliederbereichs erreichbar.\n\nFür persönliche Gespräche und Veranstaltungen steht zusätzlich ein QR-Code bereit. Änderungen am Profil werden direkt in der Visitenkarte übernommen, sodass keine veralteten Kontaktdaten verteilt werden.',
    'Ein aktueller Kontaktpunkt, weniger manuelle Datenpflege und eine kontrollierte öffentliche Sichtbarkeit.',
    ARRAY['content', 'public_page']::TEXT[], NULL,
    FALSE, NULL, 'published', 'selected', '2026-09-16 08:00:00+02'
),
(
    '1f286f42-cf62-4765-a6cf-08d1cc470002',
    'branchennetzwerk-anbieter-schneller-finden-2026-09',
    'Branchennetzwerk: Anbieter schneller finden',
    'Die frühere Verzeichnisansicht ist jetzt als Branchennetzwerk klarer strukturiert und leichter durchsuchbar.',
    E'Die Netzwerk-Suche verbindet Anbieter, Dienstleistungen, Regionen und Softwarelösungen in einer gemeinsamen Ansicht. Suchbegriffe können direkt zurückgesetzt werden; kompaktere Karten zeigen auf den ersten Blick, wofür ein Unternehmen steht.\n\nIn der Detailansicht finden Sie Kontaktdaten, Standort, Bewertungen und verknüpfte Softwareprodukte. Unternehmensnamen und Logos führen – sofern vorhanden – direkt zur jeweiligen Website.',
    'Weniger Suchaufwand und ein schnellerer Weg vom Bedarf zum passenden Ansprechpartner.',
    ARRAY['content', 'public_page']::TEXT[], NULL,
    FALSE, NULL, 'published', 'selected', '2026-09-18 08:00:00+02'
),
(
    '1f286f42-cf62-4765-a6cf-08d1cc470003',
    'community-austausch-und-menschen-karriere-2026-09',
    'Community: Austausch und Branchenwissen an einem Ort',
    'Die Community verbindet Beiträge, Mitglieder, Experten sowie „Menschen & Karriere“ in einer übersichtlicheren Navigation.',
    E'Im Community-Bereich erreichen Sie Diskussionen, Mitglieder und Experten ohne Umwege. Das Themenfeld „Menschen & Karriere“ macht Personalveränderungen, neue Funktionen und relevante Karriere-Updates aus der Branche sichtbar.\n\nAssistenzrollen können weiterhin Hinweise manuell einreichen. Freigegebene Meldungen erscheinen für Mitglieder in der gemeinsamen Branchenansicht; Quelle und Originalbeitrag bleiben dabei nachvollziehbar.',
    'Mehr Sichtbarkeit für Branchenwissen, Personen und relevante Veränderungen im Netzwerk.',
    ARRAY['community', 'content']::TEXT[], NULL,
    FALSE, NULL, 'published', 'selected', '2026-09-21 08:00:00+02'
),
(
    '1f286f42-cf62-4765-a6cf-08d1cc470004',
    'software-lexikon-loesungen-schneller-vergleichen-2026-09',
    'Software-Lexikon: Lösungen schneller vergleichen',
    'Kompaktere Karten, klare Kategorien und ausführliche Detailfenster erleichtern die Orientierung im Softwareangebot.',
    E'Das Software-Lexikon zeigt nun deutlicher, für welchen Einsatzbereich eine Lösung gedacht ist. Die Karten konzentrieren sich auf Name, Anbieter, wichtigste Kategorien und Kurzbeschreibung; weiterführende Informationen bleiben im Detailfenster verfügbar.\n\nSoftwareprodukte sind außerdem mit ihrem Anbieter im Branchennetzwerk verknüpft. Dadurch wechseln Sie direkt zwischen Unternehmensprofil und Produktübersicht, ohne die Suche neu zu beginnen.',
    'Schneller erfassbare Angebote und ein klarer Zusammenhang zwischen Anbieter und Softwareprodukt.',
    ARRAY['content', 'public_page']::TEXT[], NULL,
    FALSE, NULL, 'published', 'selected', '2026-09-23 08:00:00+02'
),
(
    '1f286f42-cf62-4765-a6cf-08d1cc470005',
    'oem-news-china-erweitert-2026-09',
    'OEM-News: Mehr Entwicklungen aus China im Überblick',
    'Die OEM-Beobachtung wurde für den Fuhrparkverband um zahlreiche chinesische Hersteller und Marken erweitert.',
    E'Im OEM-News-Widget werden nun mehr Meldungen zu chinesischen Herstellern und ihren europäischen Aktivitäten gebündelt. Dazu zählen unter anderem Entwicklungen rund um BYD, NIO, XPeng, Geely, Zeekr, Leapmotor, SAIC/MG, Chery sowie Omoda und Jaecoo.\n\nDie Beiträge lassen sich wie gewohnt nach OEM filtern und öffnen in einer kompakten Vorschau. Damit werden neue Modelle, Markteintritte, Vertriebsentscheidungen und Flottenangebote früher sichtbar.',
    'Ein breiteres Marktbild und frühere Hinweise auf neue Wettbewerber, Modelle und Flottenangebote.',
    ARRAY['content']::TEXT[], NULL,
    FALSE, NULL, 'published', 'selected', '2026-09-25 08:00:00+02'
),
(
    '1f286f42-cf62-4765-a6cf-08d1cc470006',
    'plattform-updates-dauerhaft-nachlesen-2026-09',
    'Neu im Dashboard: Änderungen dauerhaft nachlesen',
    'Neue und überarbeitete Funktionen stehen jetzt in einem dauerhaften, mandantenspezifischen Änderungsarchiv bereit.',
    E'Der Bereich „Neu im Dashboard“ sammelt wichtige Änderungen verständlich an einer zentralen Stelle. Die Beiträge können nach betroffenen Bereichen wie CONTENT, SALES, Community oder Publicpage gefiltert werden.\n\nJeder Mandant sieht nur die für ihn freigegebenen Informationen. Hinweise aus einem Newsletter bleiben damit dauerhaft auffindbar, auch wenn die ursprüngliche E-Mail nicht mehr zur Hand ist.',
    'Ein verlässliches Nachschlagewerk für neue Funktionen und Verbesserungen.',
    ARRAY['public_page']::TEXT[], NULL,
    FALSE, NULL, 'published', 'selected', '2026-09-28 08:00:00+02'
),
(
    '1f286f42-cf62-4765-a6cf-08d1cc470007',
    'sales-persoenlicher-kalenderlink-2026-09',
    'SALES: Persönlicher Kalenderlink für geplante Kontakte',
    'Geplante Wiedervorlagen und Kontakte können über einen persönlichen Kalenderfeed auch auf Smartphone und Desktop genutzt werden.',
    E'Im Kontaktkalender steht für berechtigte Nutzer ein persönlicher Kalenderlink zur Verfügung. Der Feed kann in gängigen Kalender-Apps abonniert werden und hält geplante Kontakte sowie Wiedervorlagen automatisch aktuell.\n\nEine kompakte Statusanzeige macht sichtbar, ob der Kalenderfeed aktiv ist. Der Link ist personenbezogen und sollte deshalb nicht öffentlich weitergegeben werden.',
    'Sales-Termine bleiben im gewohnten Kalender sichtbar, ohne sie doppelt pflegen zu müssen.',
    ARRAY['sales']::TEXT[], NULL,
    FALSE, NULL, 'published', 'selected', '2026-09-30 08:00:00+02'
),
(
    '1f286f42-cf62-4765-a6cf-08d1cc470008',
    'sales-stichwort-radar-content-signale-2026-10',
    'SALES: Mit dem Stichwort-Radar relevante Signale erkennen',
    'Eigene Triggerbegriffe verwandeln vorhandene CONTENT-Beiträge in konkrete Hinweise für den Vertrieb.',
    E'Im Stichwort-Radar definieren Sie bis zu 25 Begriffe oder Wortgruppen, die für Ihr Angebot wichtig sind – beispielsweise „Joint Venture“, „neuer Standort“ oder „Flottenausschreibung“. Die Archivvorschau zeigt vor dem Speichern, welche Inhalte dazu passen.\n\nTreffer können für alle aktiven Accounts, ausgewählte Accounts oder zunächst ohne Account-Zuordnung geprüft werden. Zeitraum und CONTENT-Mindest-Relevanz grenzen die Suche zusätzlich ein.',
    'Bestehende Inhalte werden als Vertriebssignale nutzbar, ohne eine zusätzliche KI-Analyse auszulösen.',
    ARRAY['sales', 'content']::TEXT[], NULL,
    FALSE, NULL, 'published', 'selected', '2026-10-02 08:00:00+02'
),
(
    '1f286f42-cf62-4765-a6cf-08d1cc470009',
    'sales-firmen-radar-accounts-zuordnen-2026-10',
    'SALES: Firmen-Radar verbindet Meldungen und Accounts',
    'Erkannte Unternehmensnamen helfen dabei, relevante Artikel direkt einem bestehenden Sales-Account zuzuordnen.',
    E'Der Firmen-Radar durchsucht vorhandene Inhalte nach den Namen und bekannten Bezeichnungen aktiver Accounts. Wird zusätzlich ein hinterlegtes Stichwort erkannt, entsteht ein qualifizierter Trigger-Treffer für die Arbeitsliste.\n\nFalls noch kein Account passt, bleibt der Treffer sichtbar und kann später zugeordnet werden. Damit gehen interessante Marktsignale nicht verloren, nur weil ein Unternehmen noch nicht im Accountbestand angelegt wurde.',
    'Weniger manuelle Recherche und eine nachvollziehbare Verbindung zwischen Nachricht, Unternehmen und nächstem Schritt.',
    ARRAY['sales', 'content']::TEXT[], NULL,
    FALSE, NULL, 'published', 'selected', '2026-10-04 08:00:00+02'
),
(
    '1f286f42-cf62-4765-a6cf-08d1cc470010',
    'sales-teamzuordnung-und-bearbeitung-2026-10',
    'SALES: Accounts einfacher im Team zuordnen und bearbeiten',
    'Verantwortlichkeiten, Teammitglieder und Accountdaten lassen sich jetzt klarer an einer Stelle pflegen.',
    E'In der Account-Detailansicht können berechtigte Nutzer Verantwortliche und weitere Teammitglieder direkt zuordnen. Die Bearbeitung bündelt Kontaktdaten, Status, Website, Wettbewerber und interne Hinweise in einem nachvollziehbaren Ablauf.\n\nFilter nach Verantwortlichkeit zeigen anschließend nur die Accounts und Signale, die für die eigene Arbeit relevant sind. So bleibt auch bei wachsendem Accountbestand klar, wer den nächsten Schritt übernimmt.',
    'Klare Zuständigkeiten und weniger Abstimmungsaufwand im Sales-Team.',
    ARRAY['sales']::TEXT[], NULL,
    FALSE, NULL, 'published', 'selected', '2026-10-06 08:00:00+02'
),
(
    '1f286f42-cf62-4765-a6cf-08d1cc470011',
    'sales-kampagnensteuerung-strukturiert-2026-10',
    'SALES: Kampagnen strukturiert vorbereiten und steuern',
    'Accounts, Signale und Kontaktaufgaben können in Kampagnen gebündelt und gemeinsam verfolgt werden.',
    E'Mit der Kampagnensteuerung gruppieren Sie ausgewählte Accounts nach einem gemeinsamen Vertriebsziel. In der Arbeitsliste und im Sales-Cockpit lässt sich anschließend nach Kampagne filtern; geplante und erledigte Schritte bleiben voneinander getrennt.\n\nIst noch keine Kampagne vorhanden, führt ein direkter Link aus dem nächsten Schritt zur Anlage. Damit wird aus einem relevanten Signal ohne unnötige Navigation eine konkrete Vertriebsaktivität.',
    'Ein durchgängiger Weg vom Marktimpuls über die Zielgruppe bis zur dokumentierten Aktivität.',
    ARRAY['sales']::TEXT[], NULL,
    FALSE, NULL, 'published', 'selected', '2026-10-08 08:00:00+02'
),
(
    '1f286f42-cf62-4765-a6cf-08d1cc470012',
    'sales-arbeitsliste-heute-und-pipeline-2026-10',
    'SALES: Arbeitsliste, Heute und Pipeline klarer verbunden',
    'Die neue Struktur führt von offenen Signalen über geplante Schritte bis zur Sales-Pipeline.',
    E'Die Sales-Arbeitsliste zeigt offene Signale, Wiedervorlagen und Zuständigkeiten in einer gemeinsamen, filterbaren Ansicht. Zeitraum, Suche und Verantwortliche stehen direkt oberhalb der Treffer; erledigte oder ausgeblendete Einträge sind klar gekennzeichnet.\n\nDie Artikel-Heatmap macht aktive Wochen und den heutigen Tag sichtbar. Von einem relevanten Treffer gelangen Sie direkt zur Kontaktplanung, während geplante Schritte im Kalender und qualifizierte Vorgänge in der Pipeline weitergeführt werden.',
    'Ein übersichtlicher Tagesfokus und eine verständliche Verbindung zwischen Signal, Aufgabe und Vertriebschance.',
    ARRAY['sales']::TEXT[], NULL,
    FALSE, NULL, 'published', 'selected', '2026-10-10 08:00:00+02'
)
ON CONFLICT (slug) DO NOTHING;

-- Elf allgemeine Updates gehen an alle vier ausgewählten Mandanten.
INSERT INTO platform_update_partners (update_id, business_partner_id)
SELECT pu.id, bp.id
FROM platform_updates pu
JOIN business_partners bp
  ON bp.slug = ANY(ARRAY['fva', 'm', 'jawa-austria-gmbh', 'industriewald-e-v']::TEXT[])
WHERE pu.slug = ANY(ARRAY[
    'digitale-visitenkarte-gezielt-freigeben-2026-09',
    'branchennetzwerk-anbieter-schneller-finden-2026-09',
    'community-austausch-und-menschen-karriere-2026-09',
    'software-lexikon-loesungen-schneller-vergleichen-2026-09',
    'plattform-updates-dauerhaft-nachlesen-2026-09',
    'sales-persoenlicher-kalenderlink-2026-09',
    'sales-stichwort-radar-content-signale-2026-10',
    'sales-firmen-radar-accounts-zuordnen-2026-10',
    'sales-teamzuordnung-und-bearbeitung-2026-10',
    'sales-kampagnensteuerung-strukturiert-2026-10',
    'sales-arbeitsliste-heute-und-pipeline-2026-10'
]::TEXT[])
ON CONFLICT (update_id, business_partner_id) DO NOTHING;

-- Die erweiterte Beobachtung chinesischer OEMs ist exklusiv für den Fuhrparkverband.
INSERT INTO platform_update_partners (update_id, business_partner_id)
SELECT pu.id, bp.id
FROM platform_updates pu
JOIN business_partners bp ON bp.slug = 'fva'
WHERE pu.slug = 'oem-news-china-erweitert-2026-09'
ON CONFLICT (update_id, business_partner_id) DO NOTHING;
