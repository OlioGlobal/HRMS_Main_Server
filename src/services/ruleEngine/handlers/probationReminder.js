const { format, subDays, addDays, startOfDay, endOfDay } = require('date-fns');
const Employee = require('../../../models/Employee');
const Department = require('../../../models/Department');
const { findHRUsers, fullName } = require('./helpers');

const slug = 'probation-reminder';

/**
 * Find employees whose probation ends in `config.daysBefore` days.
 * Recipients: employee, their manager, and HR users.
 */
const findRecipients = async (companyId, contextData, config) => {
  try {
    const daysBefore = config?.daysBefore ?? 7;
    const today = startOfDay(new Date());
    const rangeEnd = endOfDay(addDays(today, daysBefore));

    // Range: probation ends between today and today + daysBefore
    // If server was down yesterday, today's run still catches it
    const employees = await Employee.find({
      company_id: companyId,
      status: 'active',
      probationEndDate: { $gte: today, $lte: rangeEnd },
    })
      .populate('user_id', '_id email firstName lastName')
      .populate('reportingManager_id', '_id user_id firstName lastName')
      .populate('department_id', '_id name')
      .lean();

    if (!employees.length) return [];

    const hrUserIds = await findHRUsers(companyId);
    const recipients = [];

    for (const emp of employees) {
      const employeeName = fullName(emp);
      const department = emp.department_id?.name || 'N/A';
      const probEndFormatted = format(new Date(emp.probationEndDate), 'dd MMM yyyy');
      const actionUrl = `/dashboard/employees/${emp._id}`;

      const variables = {
        employeeName,
        employeeId: emp.employeeId,
        probationEndDate: probEndFormatted,
        daysBefore,
        department,
      };

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
