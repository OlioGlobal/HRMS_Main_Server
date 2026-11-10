const Company = require('../../../models/Company');
const Employee = require('../../../models/Employee');
const { fullName } = require('./helpers');

const slug = 'monthly-attendance-review';

/** Today's day-of-month and the previous month's label ("October 2026") in the given timezone. */
const getMonthContext = (now, timeZone) => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric' })
    .formatToParts(now);
  const part = (type) => Number(parts.find((p) => p.type === type).value);
  const previousMonth = new Date(Date.UTC(part('year'), part('month') - 2, 1));
  const monthName = previousMonth.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return { day: part('day'), monthName };
};

/**
 * On the configured day of the month, notify every active/notice employee
 * (or only the selected ones) to review last month's attendance.
 */
const findRecipients = async (companyId, contextData, config) => {
  try {
    const company = await Company.findById(companyId).select('settings.timezone').lean();
    const { day, monthName } = getMonthContext(new Date(), company?.settings?.timezone || 'UTC');
    if (day !== (config?.dayOfMonth || 1)) return [];

    const filter = { company_id: companyId, status: { $in: ['active', 'notice'] }, user_id: { $ne: null } };
    if (config?.audience === 'selected') filter._id = { $in: config.employeeIds || [] };

    const employees = await Employee.find(filter).select('user_id firstName lastName').lean();
    return employees.map((emp) => ({
      userId: emp.user_id.toString(),
      variables: { employeeName: fullName(emp), monthName },
      actionUrl: '/dashboard/attendance/my',
    }));
  } catch (err) {
    console.error(`[RuleEngine] ${slug} handler error:`, err.message);
    return [];
  }
};

module.exports = { slug, getMonthContext, findRecipients };
