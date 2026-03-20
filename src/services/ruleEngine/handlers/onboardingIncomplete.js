const { format, differenceInDays, subDays } = require('date-fns');
const Employee = require('../../../models/Employee');
const { findHRUsers, fullName } = require('./helpers');

const slug = 'onboarding-incomplete';

/**
 * Find active employees whose onboarding is incomplete and who joined
 * more than `config.daysAfter` days ago.
 * Recipients: employee + HR.
 */
const findRecipients = async (companyId, contextData, config) => {
  try {
    const daysAfter = config?.daysAfter ?? 7;
    const cutoffDate = subDays(new Date(), daysAfter);

    const employees = await Employee.find({
      company_id: companyId,
      status: 'active',
      onboardingCompleted: { $ne: true },
      createdAt: { $lte: cutoffDate },
    })
      .select('_id user_id firstName lastName employeeId joiningDate createdAt')
      .lean();

    if (!employees.length) return [];

    const hrUserIds = await findHRUsers(companyId);
    const recipients = [];
    const today = new Date();

    for (const emp of employees) {
      const employeeName = fullName(emp);
      const joiningDate = emp.joiningDate
        ? format(new Date(emp.joiningDate), 'dd MMM yyyy')
        : 'N/A';
      const daysSinceJoining = emp.joiningDate
        ? differenceInDays(today, new Date(emp.joiningDate))
        : differenceInDays(today, new Date(emp.createdAt));

      const variables = {
        employeeName,
        employeeId: emp.employeeId,
        joiningDate,
        daysSinceJoining,
      };

      const actionUrl = '/dashboard/boarding';

      // Employee
      if (emp.user_id) {
        recipients.push({
          userId: emp.user_id.toString(),
          recipientType: 'employee',
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
