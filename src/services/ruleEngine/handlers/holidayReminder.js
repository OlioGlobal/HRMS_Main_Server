const { format, addDays, differenceInDays, endOfDay } = require('date-fns');
const PublicHoliday = require('../../../models/PublicHoliday');
const Employee = require('../../../models/Employee');
const Location = require('../../../models/Location');
const Company = require('../../../models/Company');
const { getLocalHour, buildLocationTZMap, resolveEmployeeTZ } = require('./helpers');

module.exports = {
  slug: 'holiday-reminder',

  async findRecipients(companyId, contextData, config) {
    const daysBefore = config.daysBefore ?? 2;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Per-location gating: only remind employees whose own location-local hour matches
    // the configured run hour, so each office gets reminded at its local run time.
    const runHour = contextData?._runHour ?? null;
    let companyTZ = 'UTC';
    let locTZMap = new Map();
    if (runHour !== null) {
      const company = await Company.findById(companyId).select('settings.timezone').lean();
      companyTZ = company?.settings?.timezone || 'UTC';
      locTZMap = await buildLocationTZMap(companyId, companyTZ);
    }

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
        // Per-location gating: skip recipients whose local hour isn't the run hour yet.
        if (runHour !== null && getLocalHour(resolveEmployeeTZ(emp, locTZMap, companyTZ)) !== runHour) {
          continue;
        }

        const isAtLocation = !isLocationSpecific ||
          (emp.location_id && emp.location_id.toString() === holiday.location_id.toString());

        recipients.push({
          userId: emp.user_id.toString(),
          recipientType: 'employee',
          // For consolidated email: one message per holiday, everyone CC'd (no single primary).
          consolidateKey: holiday._id.toString(),
          isPrimary: false,
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
