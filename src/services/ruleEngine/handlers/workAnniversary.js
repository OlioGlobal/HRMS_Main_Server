const Employee = require('../../../models/Employee');
const User = require('../../../models/User');
const Department = require('../../../models/Department');
const Company = require('../../../models/Company');
const { fullName, getLocalHour, buildLocationTZMap, resolveEmployeeTZ } = require('./helpers');
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

    // Per-location gating: only celebrate at the subject's own location-local run hour,
    // so the employee (and their manager) are notified at that office's run time.
    const runHour = contextData?._runHour ?? null;
    let companyTZ = 'UTC';
    let locTZMap = new Map();
    if (runHour !== null) {
      const company = await Company.findById(companyId).select('settings.timezone').lean();
      companyTZ = company?.settings?.timezone || 'UTC';
      locTZMap = await buildLocationTZMap(companyId, companyTZ);
    }

    const recipients = [];

    for (const emp of employees) {
      const employeeName = fullName(emp);
      const joiningDate = new Date(emp.joiningDate);
      const years = currentYear - joiningDate.getUTCFullYear();

      if (years < 1) continue;

      // Skip employees whose location-local hour isn't the run hour yet (per-location mode).
      if (runHour !== null && getLocalHour(resolveEmployeeTZ(emp, locTZMap, companyTZ)) !== runHour) {
        continue;
      }

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
