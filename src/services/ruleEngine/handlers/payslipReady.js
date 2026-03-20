const PayrollRecord = require('../../../models/PayrollRecord');
const Employee = require('../../../models/Employee');

const slug = 'payslip-ready';

/**
 * Event-triggered: payroll run completed.
 * contextData: { companyId, payrollRun }
 * Recipients: all employees in the payroll run.
 */
const findRecipients = async (companyId, contextData, config) => {
  try {
    const { payrollRun } = contextData || {};
    if (!payrollRun?._id) return [];

    const records = await PayrollRecord.find({
      company_id: companyId,
      payrollRun_id: payrollRun._id,
    })
      .select('employee_id')
      .lean();

    if (!records.length) return [];

    // Batch fetch employees
    const employeeIds = [...new Set(records.map((r) => r.employee_id.toString()))];
    const employees = await Employee.find({
      _id: { $in: employeeIds },
      company_id: companyId,
    })
      .select('_id user_id')
      .lean();

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];

    const variables = {
      month: monthNames[(payrollRun.month - 1)] || payrollRun.month,
      year: payrollRun.year,
    };

    const recipients = [];

    for (const emp of employees) {
      if (!emp.user_id) continue;

      recipients.push({
        userId: emp.user_id.toString(),
        recipientType: 'employee',
        variables,
        actionUrl: '/dashboard/payroll',
      });
    }

    return recipients;
  } catch (err) {
    console.error(`[RuleEngine] ${slug} handler error:`, err.message);
    return [];
  }
};

module.exports = { slug, findRecipients };
