const { format, addDays, differenceInDays, endOfDay } = require('date-fns');
const PublicHoliday = require('../../../models/PublicHoliday');
const Employee = require('../../../models/Employee');
const Location = require('../../../models/Location');

module.exports = {
  slug: 'holiday-reminder',

  async findRecipients(companyId, _contextData, config) {
    const daysBefore = config.daysBefore ?? 2;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const rangeEnd = endOfDay(addDays(today, daysBefore));

    const holidays = await PublicHoliday.find({
      company_id: companyId,
      date: { $gte: today, $lte: rangeEnd },
      isOptional: { $ne: true },
      isActive: true,
    }).lean();

    if (!holidays.length) return [];

    // Pre-fetch location names
    const locationIds = holidays.filter(h => h.location_id).map(h => h.location_id);
    const locations = locationIds.length > 0
      ? await Location.find({ _id: { $in: locationIds } }).select('name').lean()
      : [];
    const locMap = {};
    locations.forEach(l => { locMap[l._id.toString()] = l.name; });

    // Get ALL active employees with portal access
    const employees = await Employee.find({
      company_id: companyId,
      status: 'active',
      user_id: { $ne: null },
    }).select('_id user_id firstName lastName employeeId location_id').lean();

    if (!employees.length) return [];

    const recipients = [];

    for (const holiday of holidays) {
      const daysLeft = differenceInDays(new Date(holiday.date), today);
      const locationName = holiday.location_id ? locMap[holiday.location_id.toString()] || '' : '';
      const isLocationSpecific = !!holiday.location_id;

      // Send to ALL employees, but include location info
      for (const emp of employees) {
        const isAtLocation = !isLocationSpecific ||
          (emp.location_id && emp.location_id.toString() === holiday.location_id.toString());

        recipients.push({
          userId: emp.user_id.toString(),
          recipientType: 'employee',
          variables: {
            employeeName: `${emp.firstName} ${emp.lastName}`,
            employeeId: emp.employeeId,
            holidayName: holiday.name,
            holidayDate: format(new Date(holiday.date), 'dd MMM yyyy'),
            daysLeft,
            locationName: locationName || 'All Locations',
            isLocationSpecific,
            isAtLocation,
            locationNote: isLocationSpecific
              ? `This holiday is for ${locationName} office.`
              : 'This is a company-wide holiday.',
          },
          actionUrl: '/dashboard/settings/holidays',
        });
      }
    }

    return recipients;
  },
};
