/**
 * Monthly forgiveness allowances — flexi late-ins & early exits.
 *
 * These are occurrence-counted per calendar month and adjust the per-day status
 * AFTER calculateAttendanceStatus:
 *   - Flexi late-in: a late arrival (before the half-day cutoff) is a full day for
 *     the first `flexiLateInsPerMonth` occurrences that month; the (N+1)th onward
 *     escalates to `half_day`.
 *   - Early exit: leaving before shift end (on-time arrival, short hours) is
 *     forgiven to a full day (`present`) for the first `earlyExitsPerMonth`
 *     occurrences; beyond the quota it stays `half_day`.
 *
 * A day is at most ONE type (a late arrival is flexi; an on-time short day is
 * early-exit). Hard half-days (after the 11:00 cutoff), absent, on_leave and
 * holiday are never reclassified. Classifications are stored on each record so
 * the "prior occurrences this month" lookup is a cheap indexed count.
 */
const { localTimeToUTC } = require('./calculateAttendanceStatus');

const FROZEN = ['absent', 'on_leave', 'holiday'];

/**
 * Classify a finalized day. Needs the base engine result + clock times.
 * @returns {{ isFlexiLateIn: boolean, isEarlyExit: boolean }}
 */
const classifyDay = (base, clockInTime, clockOutTime, policy, dateRef, tz = 'UTC') => {
  const res = { isFlexiLateIn: false, isEarlyExit: false };
  if (!clockInTime || FROZEN.includes(base.status)) return res;

  // Clock-in after the half-day cutoff is a hard half-day — not a flexi late-in.
  let afterCutoff = false;
  if (policy.halfDayIfClockInAfter) {
    const [ch, cm] = String(policy.halfDayIfClockInAfter).split(':').map(Number);
    if (!Number.isNaN(ch) && !Number.isNaN(cm)) {
      afterCutoff = clockInTime.getTime() > localTimeToUTC(dateRef, ch, cm, tz).getTime();
    }
  }

  if (base.isLate && !afterCutoff) {
    res.isFlexiLateIn = true;                 // late arrival takes precedence
    return res;
  }

  // Early exit: clocked out before shift end, arrived on time, short-hours half day.
  if (clockOutTime && !base.isLate && base.status === 'half_day') {
    const [eh, em] = String(policy.workEnd || '18:00').split(':').map(Number);
    const shiftEndUTC = localTimeToUTC(dateRef, eh, em, tz);
    if (clockOutTime.getTime() < shiftEndUTC.getTime()) res.isEarlyExit = true;
  }
  return res;
};

/**
 * Apply the monthly allowance to a base result, given how many same-type days
 * already occurred earlier this month.
 * @param {object} base   result from calculateAttendanceStatus
 * @param {object} cls    { isFlexiLateIn, isEarlyExit }
 * @param {object} ctx    { policy, priorFlexi, priorEarlyExit }
 * @returns {{ status, flexiForgiven, flexiEscalated, earlyExitForgiven }}
 */
const applyAllowance = (base, cls, ctx) => {
  const p = ctx.policy || {};
  const out = { status: base.status, flexiForgiven: false, flexiEscalated: false, earlyExitForgiven: false };

  if (cls.isFlexiLateIn && (p.flexiLateInsPerMonth || 0) > 0) {
    if (ctx.priorFlexi >= p.flexiLateInsPerMonth) { out.status = 'half_day'; out.flexiEscalated = true; }
    else { out.flexiForgiven = true; }        // stays a full day (present/late)
  }

  if (cls.isEarlyExit && (p.earlyExitsPerMonth || 0) > 0) {
    if (ctx.priorEarlyExit < p.earlyExitsPerMonth) { out.status = 'present'; out.earlyExitForgiven = true; }
    // else: stays half_day
  }
  return out;
};

module.exports = { classifyDay, applyAllowance };
