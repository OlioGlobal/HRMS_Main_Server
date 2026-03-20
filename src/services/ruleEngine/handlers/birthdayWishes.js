const Employee = require('../../../models/Employee');
const User = require('../../../models/User');
const Department = require('../../../models/Department');
const { fullName } = require('./helpers');

const slug = 'birthday-wishes';

/**
 * Find employees whose birthday is today.
 * Recipients: employee (greeting), manager (reminder).
 */
const findRecipients = async (companyId, contextData, config) => {
  try {
    const today = new Date();
    const month = today.getMonth() + 1; // 1-based
    const day = today.getDate();

    const employees = await Employee.find({
      company_id: companyId,
      status: 'active',
      dateOfBirth: { $exists: true, $ne: null },
      $expr: {
        $and: [
          { $eq: [{ $month: '$dateOfBirth' }, month] },
          { $eq: [{ $dayOfMonth: '$dateOfBirth' }, day] },
        ],
      },
    })
      .populate('user_id', '_id email firstName lastName')
      .populate('reportingManager_id', '_id user_id firstName lastName')
      .populate('department_id', '_id name')
      .lean();

    if (!employees.length) return [];

    const recipients = [];

    for (const emp of employees) {
      const employeeName = fullName(emp);
      const department = emp.department_id?.name || 'N/A';
      const actionUrl = `/dashboard/employees/${emp._id}`;

      const variables = {
        employeeName,
        employeeId: emp.employeeId,
        department,
      };

      // Employee — birthday greeting
      if (emp.user_id?._id) {
        recipients.push({
          userId: emp.user_id._id.toString(),
          recipientType: 'employee',
          variables,
          actionUrl,
        });
      }

      // Manager — reminder
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
    }

    return recipients;
  } catch (err) {
    console.error(`[RuleEngine] ${slug} handler error:`, err.message);
    return [];
  }
};

module.exports = { slug, findRecipients };
