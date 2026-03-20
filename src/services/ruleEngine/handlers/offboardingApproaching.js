const { format, differenceInDays, subDays, startOfDay } = require('date-fns');
const Employee = require('../../../models/Employee');
const { findHRUsers, fullName } = require('./helpers');

const slug = 'offboarding-approaching';

/**
 * Find employees on notice whose lastWorkingDay is approaching.
 * lastWorkingDay minus config.daysBefore <= today, offboardingCompletedAt is null.
 * Recipients: employee + manager + HR.
 */
const findRecipients = async (companyId, contextData, config) => {
  try {
    const daysBefore = config?.daysBefore ?? 7;
    const today = startOfDay(new Date());

    // lastWorkingDay minus daysBefore <= today  →  lastWorkingDay <= today + daysBefore
    // Also lastWorkingDay must be in the future or today
    const maxLwd = new Date(today);
    maxLwd.setDate(maxLwd.getDate() + daysBefore);

    const employees = await Employee.find({
      company_id: companyId,
      status: 'notice',
      lastWorkingDay: { $exists: true, $ne: null, $gte: today, $lte: maxLwd },
      offboardingCompletedAt: null,
    })
      .populate('user_id', '_id email firstName lastName')
      .populate('reportingManager_id', '_id user_id firstName lastName')
      .lean();

    if (!employees.length) return [];

    const hrUserIds = await findHRUsers(companyId);
    const recipients = [];

    for (const emp of employees) {
      const employeeName = fullName(emp);
      const lwd = new Date(emp.lastWorkingDay);
      const daysLeft = differenceInDays(lwd, today);

      const variables = {
        employeeName,
        employeeId: emp.employeeId,
        lastWorkingDay: format(lwd, 'dd MMM yyyy'),
        daysLeft,
      };

      const actionUrl = '/dashboard/boarding?tab=offboarding';

      // Employee
      if (emp.user_id?._id) {
        recipients.push({
          userId: emp.user_id._id.toString(),
          recipientType: 'employee',
          variables,
          actionUrl,
        });
      }

      // Manager
      if (emp.reportingManager_id?.user_id) {
        const managerId =
          typeof emp.reportingManager_id.user_id === 'object'
            ? emp.reportingManager_id.user_id.toString()
            : emp.reportingManager_id.user_id.toString();

        recipients.push({
          userId: managerId,
          recipientType: 'manager',
          variables,
          actionUrl,
        });
      }

      // HR users
      for (const hrUserId of hrUserIds) {
        recipients.push({
          userId: hrUserId,
          recipientType: 'hr',
          variables,
          actionUrl,
        });
      }
    }

    return recipients;
  } catch (err) {
    console.error(`[RuleEngine] ${slug} handler error:`, err.message);
    return [];
  }
};

module.exports = { slug, findRecipients };
