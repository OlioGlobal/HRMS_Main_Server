/**
 * Cross-checks between the Leave and Attendance modules so an employee can't be
 * both "present" and "on leave" for the same day.
 *
 * Rules:
 *   - Full-day leave and a clock-in on the same day CONTRADICT → block.
 *   - Half-day leave + a clock-in is VALID (works the other half) → allowed.
 */
const LeaveRequest     = require('../models/LeaveRequest');
const AttendanceRecord = require('../models/AttendanceRecord');
const { dayKey, dayKeyInTZ, eachCivilDay, addDays } = require('./civilDate');

/**
 * Return the calendar day (YYYY-MM-DD) the employee has clocked in on within the
 * given civil-day range, or null. `tz` is the employee/company timezone used to
 * resolve which local day a clock-in instant belongs to.
 */
const findWorkedDayInRange = async (companyId, employeeId, startCivil, endCivil, tz) => {
  const keys = new Set();
  for (const d of eachCivilDay(startCivil, endCivil)) keys.add(dayKey(d));

  const records = await AttendanceRecord.find({
    company_id:  companyId,
    employee_id: employeeId,
    clockInTime: { $ne: null, $gte: addDays(startCivil, -1), $lte: addDays(endCivil, 1) },
  }).select('clockInTime').lean();

  for (const r of records) {
    const k = dayKeyInTZ(r.clockInTime, tz);
    if (keys.has(k)) return k;
  }
  return null;
};

/**
 * Return the approved leave covering a given civil day (or null).
 * The caller decides what to do based on `isHalfDay`.
 */
const findApprovedLeaveOnDay = async (companyId, employeeId, civilDay) => {
  const key = dayKey(civilDay);
  const leaves = await LeaveRequest.find({
    company_id:  companyId,
    employee_id: employeeId,
    status:      'approved',
    startDate:   { $lte: addDays(civilDay, 1) },
    endDate:     { $gte: addDays(civilDay, -1) },
  }).select('startDate endDate isHalfDay halfDaySession').lean();

  return leaves.find((l) => key >= dayKey(l.startDate) && key <= dayKey(l.endDate)) || null;
};

module.exports = { findWorkedDayInRange, findApprovedLeaveOnDay };
