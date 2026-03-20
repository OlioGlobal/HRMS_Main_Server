const { format, addDays, differenceInDays, startOfDay, endOfDay } = require('date-fns');
const PublicHoliday = require('../../../models/PublicHoliday');
const Employee = require('../../../models/Employee');

module.exports = {
  slug: 'holiday-reminder',

  async findRecipients(companyId, _contextData, config) {
    const daysBefore = config.daysBefore ?? 2;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const rangeEnd = endOfDay(addDays(today, daysBefore));

    // Find active, non-optional holidays within range (today → today + daysBefore)
    const holidays = await PublicHoliday.find({
      company_id: companyId,
      date: { $gte: today, $lte: rangeEnd },
      isOptional: { $ne: true },
      isActive: true,
    }).lean();

    if (!holidays.length) return [];

    // Get all active employees with portal access + their location
    const employees = await Employee.find({
      company_id: companyId,
      status: 'active',
      user_id: { $ne: null },
    }).select('_id user_id firstName lastName employeeId location_id').lean();

    if (!employees.length) return [];

    const recipients = [];

    for (const holiday of holidays) {
      const daysLeft = differenceInDays(new Date(holiday.date), today);

      for (const emp of employees) {
        // If holiday is location-specific, only notify employees at that location
        if (holiday.location_id && emp.location_id &&
            holiday.location_id.toString() !== emp.location_id.toString()) {
          continue;
        }

        recipients.push({
          userId: emp.user_id.toString(),
          recipientType: 'employee',
          variables: {
            employeeName: `${emp.firstName} ${emp.lastName}`,
            employeeId: emp.employeeId,
            holidayName: holiday.name,
            holidayDate: format(new Date(holiday.date), 'dd MMM yyyy'),
            daysLeft,
          },
          actionUrl: '/dashboard/settings/holidays',
        });
      }
    }

    return recipients;
  },
};
