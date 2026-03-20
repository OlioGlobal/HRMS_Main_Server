const Employee = require('../../../models/Employee');
const User = require('../../../models/User');
const Department = require('../../../models/Department');
const { fullName } = require('./helpers');
const { format } = require('date-fns');

const slug = 'work-anniversary';

/**
 * Find employees whose work anniversary is today (at least 1 year).
 * Recipients: employee + manager.
 */
const findRecipients = async (companyId, contextData, config) => {
  try {
    const today = new Date();
    const month = today.getMonth() + 1;
    const day = today.getDate();
    const currentYear = today.getFullYear();

    const employees = await Employee.find({
      company_id: companyId,
      status: 'active',
      joiningDate: { $exists: true, $ne: null },
      $expr: {
        $and: [
          { $eq: [{ $month: '$joiningDate' }, month] },
          { $eq: [{ $dayOfMonth: '$joiningDate' }, day] },
          { $ne: [{ $year: '$joiningDate' }, currentYear] },
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
      const joiningDate = new Date(emp.joiningDate);
      const years = currentYear - joiningDate.getUTCFullYear();

      if (years < 1) continue;

      const variables = {
        employeeName,
        employeeId: emp.employeeId,
        years,
        joiningDate: format(joiningDate, 'dd MMM yyyy'),
        department: emp.department_id?.name || 'N/A',
      };

      const actionUrl = `/dashboard/employees/${emp._id}`;

      if (emp.user_id?._id) {
        recipients.push({
          userId: emp.user_id._id.toString(),
          recipientType: 'employee',
          variables,
          actionUrl,
        });
      }

      if (emp.reportingManager_id?.user_id) {
        const managerId = typeof emp.reportingManager_id.user_id === 'object'
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
