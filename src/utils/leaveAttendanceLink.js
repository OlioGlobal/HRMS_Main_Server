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
const Employee         = require('../models/Employee');
const WorkPolicy       = require('../models/WorkPolicy');
const PublicHoliday    = require('../models/PublicHoliday');
const { dayKey, dayKeyInTZ, eachCivilDay, addDays, parseCivil, todayCivil, DAY_NAMES } = require('./civilDate');

// Attendance records are keyed by UTC-midnight of the calendar day; civil days are
// noon-UTC. Convert a civil day → the matching attendance `date`.
const attDate = (civil) => new Date(Date.UTC(civil.getUTCFullYear(), civil.getUTCMonth(), civil.getUTCDate()));

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

/**
 * Keep AttendanceRecords in sync with an approved leave so leave days never show
 * as "absent". For each WORKING day (per the employee's work policy) in the leave
 * range that isn't a public holiday:
 *   - mark: upsert the day to `on_leave` (full-day) / `half_day` (half-day),
 *           unless the employee actually clocked in that day (then leave it).
 *   - revert: undo days we set — past days → `absent`, today/future → delete.
 * Best-effort: never throws into the caller.
 */
const syncLeaveAttendance = async (companyId, leave, { revert = false } = {}) => {
  try {
    const startC = parseCivil(leave.startDate);
    const endC   = parseCivil(leave.endDate);
    if (!startC || !endC) return;

    const employee = await Employee.findOne({ _id: leave.employee_id, company_id: companyId })
      .select('workPolicy_id location_id').lean();
    if (!employee) return;

    let policy = employee.workPolicy_id
      ? await WorkPolicy.findById(employee.workPolicy_id).select('workingDays').lean()
      : null;
    if (!policy) policy = await WorkPolicy.findOne({ company_id: companyId, isDefault: true }).select('workingDays').lean();
    const workingDays = policy?.workingDays?.length ? policy.workingDays : ['MON', 'TUE', 'WED', 'THU', 'FRI'];

    // Non-optional holidays in range (company-wide or matching the employee's location)
    const holidays = await PublicHoliday.find({
      company_id: companyId, isActive: true, isOptional: false,
      date: { $gte: addDays(startC, -1), $lte: addDays(endC, 1) },
    }).select('date location_id').lean();
    const holidaySet = new Set();
    for (const h of holidays) {
      if (!h.location_id || (employee.location_id && String(h.location_id) === String(employee.location_id))) {
        holidaySet.add(dayKey(h.date));
      }
    }

    const status   = leave.isHalfDay ? 'half_day' : 'on_leave';
    const todayC   = todayCivil();
    const todayMid = attDate(todayC);

    for (const civil of eachCivilDay(startC, endC)) {
      if (!workingDays.includes(DAY_NAMES[civil.getUTCDay()])) continue; // weekend / non-working
      if (holidaySet.has(dayKey(civil))) continue;                       // holiday, not leave

      const date = attDate(civil);
      const existing = await AttendanceRecord.findOne({ company_id: companyId, employee_id: leave.employee_id, date });

      if (revert) {
        if (existing && !existing.clockInTime && (existing.status === 'on_leave' || existing.status === 'half_day')) {
          if (date < todayMid) { existing.status = 'absent'; await existing.save(); }
          else { await AttendanceRecord.deleteOne({ _id: existing._id }); }
        }
        continue;
      }

      if (existing) {
        if (existing.clockInTime) continue;            // actually worked → don't override
        if (existing.status !== status) {
          existing.status = status; existing.isLate = false; existing.lateByMinutes = 0;
          existing.totalHours = 0; existing.overtimeHours = 0;
          await existing.save();
        }
      } else {
        await AttendanceRecord.create({ company_id: companyId, employee_id: leave.employee_id, date, status });
      }
    }
  } catch (err) {
    console.error('[leaveAttendanceLink] syncLeaveAttendance failed:', err.message);
  }
};

module.exports = { findWorkedDayInRange, findApprovedLeaveOnDay, syncLeaveAttendance };
