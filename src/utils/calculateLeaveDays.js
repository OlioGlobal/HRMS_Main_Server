const PublicHoliday          = require('../models/PublicHoliday');
const EmployeeOptionalHoliday = require('../models/EmployeeOptionalHoliday');
const { parseCivil, dayKey, dayOfWeek, civilYear, eachCivilDay } = require('./civilDate');

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
  // Normalize to civil days (noon-UTC) so day-of-week and holiday matching are
  // identical regardless of server timezone. Holidays are stored noon-UTC too.
  const start = parseCivil(startDate);
  const end   = parseCivil(endDate);

  const {
    companyId,
    employeeId,
    locationId = null,
    weekendDays = ['SAT', 'SUN'],
    countWeekends = false,
    countHolidays = false,
  } = opts;

  // Build set of holiday day-keys (YYYY-MM-DD)
  let holidaySet = new Set();

  if (!countHolidays) {
    const years = new Set([civilYear(start), civilYear(end)]);

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
      holidaySet.add(dayKey(h.date));
    });

    // Optional holidays picked by this employee
    if (employeeId) {
      const optPicked = await EmployeeOptionalHoliday
        .find({ employee_id: employeeId, year: { $in: [...years] } })
        .populate({ path: 'holiday_id', select: 'date', match: { isActive: true } })
        .lean();
      optPicked.forEach((o) => {
        if (o.holiday_id?.date) {
          holidaySet.add(dayKey(o.holiday_id.date));
        }
      });
    }
  }

  let days = 0;
  for (const current of eachCivilDay(start, end)) {
    const isWeekend = weekendDays.includes(dayOfWeek(current));
    const isHoliday = holidaySet.has(dayKey(current));

    const skip = (!countWeekends && isWeekend) || (!countHolidays && isHoliday);
    if (!skip) days++;
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
