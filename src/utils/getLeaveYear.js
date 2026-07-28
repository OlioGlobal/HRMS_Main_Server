/**
 * Returns the "balance year" key used for LeaveBalance.year.
 *
 * fiscal_year  → the calendar year in which the fiscal year STARTED
 *   e.g. fiscalYearStart=4 (April):
 *     Jan 2026  → FY started Apr 2025  → returns 2025
 *     Apr 2026  → FY started Apr 2026  → returns 2026
 *     Dec 2026  → FY started Apr 2026  → returns 2026
 *
 * calendar_year / monthly / none → plain calendar year of the date
 *
 * @param {Date|string} date
 * @param {string} resetCycle  'fiscal_year' | 'calendar_year' | 'monthly' | 'none'
 * @param {number} fiscalYearStart  1–12  (1=Jan, 4=Apr …)
 * @returns {number}
 */
const { parseCivil } = require('./civilDate');

function getLeaveYear(date, resetCycle, fiscalYearStart = 1) {
  // Use the civil (timezone-stable) calendar day so the year bucket doesn't
  // shift by the server offset at fiscal/calendar boundaries.
  const d       = parseCivil(date) ?? new Date(date);
  const month   = d.getUTCMonth() + 1; // 1–12
  const calYear = d.getUTCFullYear();

  if (resetCycle === 'fiscal_year') {
    return month >= fiscalYearStart ? calYear : calYear - 1;
  }

  return calYear;
}

module.exports = { getLeaveYear };
