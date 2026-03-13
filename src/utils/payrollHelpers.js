const PublicHoliday = require('../models/PublicHoliday');
const LeaveRequest = require('../models/LeaveRequest');
const AttendanceRecord = require('../models/AttendanceRecord');

const DAY_MAP = { 0: 'SUN', 1: 'MON', 2: 'TUE', 3: 'WED', 4: 'THU', 5: 'FRI', 6: 'SAT' };

/**
 * Get all dates in a month that are working days (per policy) minus public holidays.
 * Returns { totalWorkingDays, holidayDates }
 */
const getWorkingDaysInMonth = async (month, year, workingDays, locationId, companyId) => {
  // Get public holidays for this month
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd   = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  const holidays = await PublicHoliday.find({
    company_id: companyId,
    date: { $gte: monthStart, $lte: monthEnd },
    isActive: true,
    isOptional: false,
    $or: [
      { location_id: null },
      ...(locationId ? [{ location_id: locationId }] : []),
    ],
  }).lean();

  const holidayDateSet = new Set(
    holidays.map((h) => new Date(h.date).toISOString().slice(0, 10))
  );

  let totalWorkingDays = 0;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(Date.UTC(year, month - 1, d));
    const dayName = DAY_MAP[date.getUTCDay()];
    const dateStr = date.toISOString().slice(0, 10);

    if (workingDays.includes(dayName) && !holidayDateSet.has(dateStr)) {
      totalWorkingDays++;
    }
  }

  return { totalWorkingDays, holidayDates: holidayDateSet };
};

/**
 * Get working days from a specific start date to end of month.
 * Used for mid-month joiners.
 */
const getWorkingDaysFrom = async (fromDate, month, year, workingDays, locationId, companyId) => {
  const { holidayDates } = await getWorkingDaysInMonth(month, year, workingDays, locationId, companyId);

  const startDay = new Date(fromDate).getUTCDate();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let count = 0;

  for (let d = startDay; d <= daysInMonth; d++) {
    const date = new Date(Date.UTC(year, month - 1, d));
    const dayName = DAY_MAP[date.getUTCDay()];
    const dateStr = date.toISOString().slice(0, 10);

    if (workingDays.includes(dayName) && !holidayDates.has(dateStr)) {
      count++;
    }
  }

  return count;
};

/**
 * Get working days from start of month to a specific end date.
 * Used for mid-month resignations.
 */
const getWorkingDaysTo = async (toDate, month, year, workingDays, locationId, companyId) => {
  const { holidayDates } = await getWorkingDaysInMonth(month, year, workingDays, locationId, companyId);

  const endDay = new Date(toDate).getUTCDate();
  let count = 0;

  for (let d = 1; d <= endDay; d++) {
    const date = new Date(Date.UTC(year, month - 1, d));
    const dayName = DAY_MAP[date.getUTCDay()];
    const dateStr = date.toISOString().slice(0, 10);

    if (workingDays.includes(dayName) && !holidayDates.has(dateStr)) {
      count++;
    }
  }

  return count;
};

/**
 * Get LWP days for an employee in a given month.
 * Only counts working days (excludes weekends + holidays).
 */
const getLWPDays = async (employeeId, month, year, workingDays, locationId, companyId) => {
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd   = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  // Get holiday + weekend sets for filtering
  const { holidayDates } = workingDays
    ? await getWorkingDaysInMonth(month, year, workingDays, locationId, companyId)
    : { holidayDates: new Set() };

  const lwpRequests = await LeaveRequest.find({
    employee_id: employeeId,
    isLWP: true,
    status: 'approved',
    $or: [
      { startDate: { $gte: monthStart, $lte: monthEnd } },
      { endDate:   { $gte: monthStart, $lte: monthEnd } },
      { startDate: { $lte: monthStart }, endDate: { $gte: monthEnd } },
    ],
  }).lean();

  let lwpDays = 0;
  for (const req of lwpRequests) {
    const start = new Date(Math.max(new Date(req.startDate).getTime(), monthStart.getTime()));
    const end   = new Date(Math.min(new Date(req.endDate).getTime(), monthEnd.getTime()));

    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const dateStr = d.toISOString().slice(0, 10);
      const dayName = DAY_MAP[d.getUTCDay()];
      // Skip weekends and holidays — only count working days
      if (workingDays && !workingDays.includes(dayName)) continue;
      if (holidayDates.has(dateStr)) continue;
      lwpDays += req.isHalfDay ? 0.5 : 1;
    }
  }

  return lwpDays;
};

/**
 * Get paid leave days (approved, non-LWP) for an employee in a given month.
 * Only counts working days (excludes weekends + holidays).
 */
const getPaidLeaveDays = async (employeeId, month, year, workingDays, locationId, companyId) => {
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd   = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  const { holidayDates } = workingDays
    ? await getWorkingDaysInMonth(month, year, workingDays, locationId, companyId)
    : { holidayDates: new Set() };

  const requests = await LeaveRequest.find({
    employee_id: employeeId,
    isLWP: { $ne: true },
    status: 'approved',
    $or: [
      { startDate: { $gte: monthStart, $lte: monthEnd } },
      { endDate:   { $gte: monthStart, $lte: monthEnd } },
      { startDate: { $lte: monthStart }, endDate: { $gte: monthEnd } },
    ],
  }).lean();

  let paidDays = 0;
  for (const req of requests) {
    const start = new Date(Math.max(new Date(req.startDate).getTime(), monthStart.getTime()));
    const end   = new Date(Math.min(new Date(req.endDate).getTime(), monthEnd.getTime()));

    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const dateStr = d.toISOString().slice(0, 10);
      const dayName = DAY_MAP[d.getUTCDay()];
      if (workingDays && !workingDays.includes(dayName)) continue;
      if (holidayDates.has(dateStr)) continue;
      paidDays += req.isHalfDay ? 0.5 : 1;
    }
  }

  return paidDays;
};

/**
 * Get attendance summary for an employee in a given month.
 * Also deduplicates: if a day is both 'absent' in attendance and LWP in leave, count it as LWP only.
 */
const getAttendanceSummary = async (employeeId, month, year, workPolicy) => {
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd   = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  const records = await AttendanceRecord.find({
    employee_id: employeeId,
    date: { $gte: monthStart, $lte: monthEnd },
  }).lean();

  // Get all approved leave requests for dedup
  const allLeaveRequests = await LeaveRequest.find({
    employee_id: employeeId,
    status: 'approved',
    $or: [
      { startDate: { $gte: monthStart, $lte: monthEnd } },
      { endDate:   { $gte: monthStart, $lte: monthEnd } },
      { startDate: { $lte: monthStart }, endDate: { $gte: monthEnd } },
    ],
  }).lean();

  const lwpDateSet = new Set();
  const lwpHalfDayLeaveSet = new Set();
  const paidHalfDayLeaveSet = new Set();

  for (const req of allLeaveRequests) {
    const start = new Date(Math.max(new Date(req.startDate).getTime(), monthStart.getTime()));
    const end   = new Date(Math.min(new Date(req.endDate).getTime(), monthEnd.getTime()));
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const dateStr = d.toISOString().slice(0, 10);
      if (req.isLWP) {
        lwpDateSet.add(dateStr);
        if (req.isHalfDay) lwpHalfDayLeaveSet.add(dateStr);
      }
      // Track paid half-day leaves (half_day attendance + paid half-day leave = full day)
      if (!req.isLWP && req.isHalfDay) {
        paidHalfDayLeaveSet.add(dateStr);
      }
    }
  }

  // Calculate standard hours from work policy
  const [startH, startM] = (workPolicy.workStart || '09:00').split(':').map(Number);
  const [endH, endM]     = (workPolicy.workEnd || '18:00').split(':').map(Number);
  let standardHours = (endH + endM / 60) - (startH + startM / 60);
  if (standardHours <= 0) standardHours += 24; // night shift

  let daysWorked = 0;
  let halfDays = 0;
  let daysAbsent = 0;
  let lateCount = 0;
  let overtimeHours = 0;
  let deductibleLateCount = 0;

  for (const rec of records) {
    const dateStr = new Date(rec.date).toISOString().slice(0, 10);

    // Dedup: if attendance says 'absent' but leave says LWP → skip from absent count
    if (rec.status === 'absent' && lwpDateSet.has(dateStr)) {
      continue; // counted as LWP instead
    }

    switch (rec.status) {
      case 'present':
      case 'late':
        daysWorked++;
        break;
      case 'half_day':
        // If there's a paid half-day leave covering the other half → count as full day worked
        if (paidHalfDayLeaveSet.has(dateStr)) {
          daysWorked++;
        } else if (lwpHalfDayLeaveSet.has(dateStr)) {
          // Half-day LWP covers the other half → count as worked (LWP deduction applied separately)
          daysWorked++;
        } else {
          halfDays++;
        }
        break;
      case 'absent':
        daysAbsent++;
        break;
      // on_leave, holiday — not counted as worked or absent
    }

    if (rec.isLate) {
      lateCount++;
      // Check ignoreLatIfHoursCompleted
      if (workPolicy.ignoreLatIfHoursCompleted && rec.totalHours >= standardHours) {
        // Don't count as deductible
      } else {
        deductibleLateCount++;
      }
    }

    if (rec.overtimeHours > 0) {
      overtimeHours += rec.overtimeHours;
    }
  }

  // Apply free passes
  const freePasses = workPolicy.lateDeductionAfterCount || 0;
  deductibleLateCount = Math.max(0, deductibleLateCount - freePasses);

  return {
    daysWorked,
    halfDays,
    daysAbsent,
    lateCount,
    deductibleLateCount,
    overtimeHours: Math.round(overtimeHours * 100) / 100,
    standardHours,
    hasAttendanceData: records.length > 0,
  };
};

/**
 * Check if employee joined mid-month.
 */
const isMidMonthJoiner = (joiningDate, month, year) => {
  const d = new Date(joiningDate);
  return d.getUTCFullYear() === year && (d.getUTCMonth() + 1) === month && d.getUTCDate() > 1;
};

/**
 * Check if employee's last working date is mid-month.
 */
const isMidMonthExit = (lastWorkingDate, month, year) => {
  if (!lastWorkingDate) return false;
  const d = new Date(lastWorkingDate);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return d.getUTCFullYear() === year && (d.getUTCMonth() + 1) === month && d.getUTCDate() < daysInMonth;
};

module.exports = {
  getWorkingDaysInMonth,
  getWorkingDaysFrom,
  getWorkingDaysTo,
  getLWPDays,
  getPaidLeaveDays,
  getAttendanceSummary,
  isMidMonthJoiner,
  isMidMonthExit,
};
