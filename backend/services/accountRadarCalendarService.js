const crypto = require('crypto');

const TOKEN_PATTERN = /^([0-9a-f-]{36})\.([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/i;

const getSecret = () => {
  const secret = String(
    process.env.ACCOUNT_RADAR_CALENDAR_SECRET
    || process.env.NEWSLETTER_TOKEN_SECRET
    || process.env.JWT_SECRET
    || ''
  );
  if (secret.length < 32) {
    throw new Error('Für den Account-Radar-Kalenderfeed fehlt ein ausreichend langes Secret.');
  }
  return secret;
};

const sign = (businessPartnerId, version) => crypto
  .createHmac('sha256', getSecret())
  .update(`account-radar-calendar:${businessPartnerId}:${version}`)
  .digest('base64url');

const buildCalendarToken = (businessPartnerId, version) => (
  `${businessPartnerId}.${version}.${sign(businessPartnerId, version)}`
);

const parseCalendarToken = (token) => {
  const match = String(token || '').match(TOKEN_PATTERN);
  if (!match) return null;
  const [, businessPartnerId, version, signature] = match;
  const expected = Buffer.from(sign(businessPartnerId, version));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return null;
  return { businessPartnerId, version };
};

const buildCalendarFeedUrl = (businessPartnerId, version) => {
  const frontendUrl = String(process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
  return `${frontendUrl}/api/public/v1/account-radar-calendar/${buildCalendarToken(businessPartnerId, version)}.ics`;
};

const escapeIcs = (value) => String(value || '')
  .replace(/\\/g, '\\\\')
  .replace(/\r?\n/g, '\\n')
  .replace(/,/g, '\\,')
  .replace(/;/g, '\\;');

const formatIcsDate = (value) => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

const foldIcsLine = (line) => {
  const chunks = [];
  let remaining = String(line || '');
  while (Buffer.byteLength(remaining, 'utf8') > 72) {
    let index = Math.min(remaining.length, 60);
    while (index > 1 && Buffer.byteLength(remaining.slice(0, index), 'utf8') > 72) index -= 1;
    chunks.push(remaining.slice(0, index));
    remaining = remaining.slice(index);
  }
  chunks.push(remaining);
  return chunks.join('\r\n ');
};

const buildCalendarIcs = ({ tenantName, entries }) => {
  const now = formatIcsDate(new Date());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mobiliti//Account Radar//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcs(`Account-Radar · ${tenantName}`)}`,
    'X-PUBLISHED-TTL:PT1H',
  ];

  entries.forEach((entry) => {
    const start = entry.task_status === 'done' && entry.completed_at
      ? entry.completed_at
      : entry.follow_up_at;
    if (!start || Number.isNaN(new Date(start).getTime())) return;
    const end = new Date(new Date(start).getTime() + 30 * 60 * 1000);
    const statusLabel = entry.task_status === 'done'
      ? 'Durchgeführt'
      : new Date(start).getTime() < Date.now() ? 'Überfällig' : 'Geplant';
    const actionLabel = entry.action_type === 'follow_up' ? 'Wiedervorlage' : 'Kontakt';
    const description = [
      `Status: ${statusLabel}`,
      entry.contact_channel ? `Kanal: ${entry.contact_channel}` : null,
      entry.assigned_user_name ? `Verantwortlich: ${entry.assigned_user_name}` : null,
      entry.sales_stage ? `Vertriebsphase: ${entry.sales_stage}` : null,
      'Interne Notizen sind im externen Kalenderfeed bewusst nicht enthalten.',
    ].filter(Boolean).join('\n');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${entry.id}@account-radar.mobiliti.at`,
      `DTSTAMP:${now}`,
      `DTSTART:${formatIcsDate(start)}`,
      `DTEND:${formatIcsDate(end)}`,
      `SUMMARY:${escapeIcs(`${statusLabel}: ${actionLabel} · ${entry.account_name}`)}`,
      `DESCRIPTION:${escapeIcs(description)}`,
      `STATUS:${entry.task_status === 'done' ? 'COMPLETED' : 'CONFIRMED'}`,
      'END:VEVENT'
    );
  });
  lines.push('END:VCALENDAR');
  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
};

module.exports = {
  buildCalendarFeedUrl,
  buildCalendarIcs,
  parseCalendarToken,
};
