const PublicHoliday          = require('../models/PublicHoliday');
const EmployeeOptionalHoliday = require('../models/EmployeeOptionalHoliday');

/**
 * Calculate working leave days between two dates,
 * excluding weekends and holidays for the employee's location.
 *
 * @param {Date|string} startDate
 * @param {Date|string} endDate
 * @param {Object}      opts
 * @param {ObjectId}    opts.companyId
 * @param {ObjectId}    opts.employeeId
 * @param {ObjectId|null} opts.locationId
 * @param {string[]}    opts.weekendDays  — e.g. ['SAT','SUN'] or from work policy
 * @param {boolean}     opts.countWeekends  — if true, weekends count as leave days
 * @param {boolean}     opts.countHolidays  — if true, holidays count as leave days
 * @returns {Promise<number>} total working days
 */
const calculateLeaveDays = async (startDate, endDate, opts = {}) => {
  const start = new Date(startDate);
  const end   = new Date(endDate);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  const {
    companyId,
    employeeId,
    locationId = null,
    weekendDays = ['SAT', 'SUN'],
    countWeekends = false,
    countHolidays = false,
  } = opts;

  // Build set of holiday dates (as YYYY-MM-DD strings)
  let holidaySet = new Set();

  if (!countHolidays) {
    const year = start.getFullYear();
    const years = new Set([year]);
    if (end.getFullYear() !== year) years.add(end.getFullYear());

    // Mandatory holidays: company-wide + location-specific
    const mandatoryFilter = {
      company_id: companyId,
      year: { $in: [...years] },
      isActive: true,
      isOptional: false,
      $or: [
        { location_id: null },
        ...(locationId ? [{ location_id: locationId }] : []),
      ],
    };
    const mandatoryHolidays = await PublicHoliday.find(mandatoryFilter).select('date').lean();
    mandatoryHolidays.forEach((h) => {
      holidaySet.add(new Date(h.date).toISOString().split('T')[0]);
    });

    // Optional holidays picked by this employee
    if (employeeId) {
      const optPicked = await EmployeeOptionalHoliday
        .find({ employee_id: employeeId, year: { $in: [...years] } })
        .populate({ path: 'holiday_id', select: 'date', match: { isActive: true } })
        .lean();
      optPicked.forEach((o) => {
        if (o.holiday_id?.date) {
          holidaySet.add(new Date(o.holiday_id.date).toISOString().split('T')[0]);
        }
      });
    }
  }

  const DAY_MAP = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  let days = 0;
  const current = new Date(start);

  while (current <= end) {
    const dayName   = DAY_MAP[current.getDay()];
    const isWeekend = weekendDays.includes(dayName);
    const dateStr   = current.toISOString().split('T')[0];
    const isHoliday = holidaySet.has(dateStr);

    const skip = (!countWeekends && isWeekend) || (!countHolidays && isHoliday);
    if (!skip) days++;

    current.setDate(current.getDate() + 1);
  }

  return days;
};

/**
 * Pro-rate days for a new joiner based on remaining months in fiscal year.
 */
const calculateProRatedDays = (joiningDate, daysPerYear, fiscalYearStartMonth, method = 'monthly') => {
  const join = new Date(joiningDate);
  const joinMonth = join.getMonth() + 1; // 1-12
  const joinDay   = join.getDate();

  // Months until fiscal year end
  let remainingMonths;
  if (joinMonth >= fiscalYearStartMonth) {
    remainingMonths = 12 - (joinMonth - fiscalYearStartMonth);
  } else {
    remainingMonths = fiscalYearStartMonth - joinMonth;
  }

  if (method === 'daily') {
    // More precise: days remaining / 365
    const endOfFiscal = new Date(join.getFullYear() + (joinMonth >= fiscalYearStartMonth ? 1 : 0), fiscalYearStartMonth - 1, 1);
    const diffMs = endOfFiscal - join;
    const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    return Math.round((daysRemaining / 365) * daysPerYear);
  }

  // Monthly method (default) — partial month counts as full
  return Math.floor((remainingMonths / 12) * daysPerYear);
};

module.exports = { calculateLeaveDays, calculateProRatedDays };
