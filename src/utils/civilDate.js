/**
 * Civil-day helper — a calendar date that is independent of server timezone.
 *
 * Root cause of the leave/holiday bugs: a "day" (leave date, holiday, fiscal
 * boundary) is a CIVIL date, not an instant. Storing it as a Date and mixing
 * local methods (setHours/getDay/getMonth) with UTC ones (toISOString) shifts it
 * by the server offset (e.g. IST +5:30 → previous day).
 *
 * Convention: every civil day is anchored at 12:00 UTC ("noon-UTC"), matching how
 * holiday.service already stores holidays. Noon-UTC never crosses a date boundary
 * for any real timezone, so the UTC getters and toISOString yield the intended day.
 *
 * ALWAYS build day-keys, day-of-week, and year buckets through these helpers so
 * both sides of any comparison use the same basis.
 */

const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const NOON_UTC  = 12;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Normalize any input to a civil Date (noon UTC of its intended calendar day).
 * - 'YYYY-MM-DD' (what the UI sends) → read Y/M/D literally, no timezone shift.
 * - Date / ISO string → uses UTC components (safe for noon-UTC & UTC-midnight
 *   stored values). Returns null for empty/invalid input.
 */
const parseCivil = (input) => {
  if (input == null || input === '') return null;

  if (typeof input === 'string') {
    const m = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], NOON_UTC, 0, 0, 0));
  }

  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), NOON_UTC, 0, 0, 0));
};

/** 'YYYY-MM-DD' key for a civil day (stable across all server timezones). */
const dayKey = (input) => {
  const c = parseCivil(input);
  return c ? c.toISOString().slice(0, 10) : null;
};

/** 'YYYY-MM-DD' calendar day of an instant *as seen in* a given IANA timezone. */
const dayKeyInTZ = (instant, timeZone) => {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date(instant));
  } catch {
    return dayKey(instant);
  }
};

/** 'MON'…'SUN' for a civil day. */
const dayOfWeek = (input) => {
  const c = parseCivil(input);
  return c ? DAY_NAMES[c.getUTCDay()] : null;
};

/** Calendar year of a civil day. */
const civilYear = (input) => {
  const c = parseCivil(input);
  return c ? c.getUTCFullYear() : null;
};

/** Add n whole days to a civil date (stays noon-UTC — UTC has no DST). */
const addDays = (civil, n) => new Date(parseCivil(civil).getTime() + n * MS_PER_DAY);

/** Whole-day difference end - start (both coerced to civil). */
const diffDays = (start, end) =>
  Math.round((parseCivil(end).getTime() - parseCivil(start).getTime()) / MS_PER_DAY);

/** Inclusive iterator of civil days from start → end. */
function* eachCivilDay(startInput, endInput) {
  const end = parseCivil(endInput);
  let cur = parseCivil(startInput);
  if (!cur || !end) return;
  while (cur.getTime() <= end.getTime()) {
    yield cur;
    cur = addDays(cur, 1);
  }
}

/**
 * "Today" as a civil day. Pass an IANA timeZone (e.g. company.settings.timezone)
 * to get the local calendar day there; otherwise uses the server's local day
 * (preserving prior behavior).
 */
const todayCivil = (timeZone) => {
  if (timeZone) {
    try {
      // en-CA formats as YYYY-MM-DD
      const s = new Intl.DateTimeFormat('en-CA', {
        timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date());
      const c = parseCivil(s);
      if (c) return c;
    } catch { /* invalid tz → fall through to server-local */ }
  }
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), NOON_UTC, 0, 0, 0));
};

module.exports = {
  DAY_NAMES,
  parseCivil,
  dayKey,
  dayKeyInTZ,
  dayOfWeek,
  civilYear,
  addDays,
  diffDays,
  eachCivilDay,
  todayCivil,
};
