const MEMBERSHIP_TIME_ZONE = 'Europe/Vienna';

function dateKeyInVienna(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MEMBERSHIP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function activeUntilDateKey(activeUntil) {
  if (!activeUntil) return null;
  if (typeof activeUntil === 'string') {
    const match = activeUntil.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  return dateKeyInVienna(activeUntil);
}

function dateKeyToUtcDay(dateKey) {
  const match = String(dateKey || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function getMembershipExpiry(activeUntil, now = new Date()) {
  const expiresOn = activeUntilDateKey(activeUntil);
  if (!expiresOn) {
    return { expiresOn: null, daysRemaining: null, isExpired: false };
  }
  const today = dateKeyInVienna(now);
  const expiryDay = dateKeyToUtcDay(expiresOn);
  const todayDay = dateKeyToUtcDay(today);
  const daysRemaining = Math.round((expiryDay - todayDay) / 86400000);
  return {
    expiresOn,
    daysRemaining,
    // Das in der Benutzerverwaltung gewählte Datum gilt einschließlich.
    isExpired: daysRemaining < 0,
  };
}

function isMembershipExpired(activeUntil, now = new Date()) {
  return getMembershipExpiry(activeUntil, now).isExpired;
}

const ACTIVE_MEMBERSHIP_SQL = `(
  u.active_until IS NULL
  OR (u.active_until AT TIME ZONE 'Europe/Vienna')::date
     >= (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Vienna')::date
)`;

module.exports = {
  MEMBERSHIP_TIME_ZONE,
  ACTIVE_MEMBERSHIP_SQL,
  activeUntilDateKey,
  dateKeyInVienna,
  getMembershipExpiry,
  isMembershipExpired,
};
