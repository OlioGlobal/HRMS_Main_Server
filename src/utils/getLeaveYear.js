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
function getLeaveYear(date, resetCycle, fiscalYearStart = 1) {
  const d       = new Date(date);
  const month   = d.getMonth() + 1; // 1–12
  const calYear = d.getFullYear();

  if (resetCycle === 'fiscal_year') {
    return month >= fiscalYearStart ? calYear : calYear - 1;
  }

  return calYear;
}

module.exports = { getLeaveYear };
