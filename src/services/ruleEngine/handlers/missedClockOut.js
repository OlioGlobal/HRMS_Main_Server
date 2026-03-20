const { format, startOfDay, endOfDay } = require('date-fns');
const AttendanceRecord = require('../../../models/AttendanceRecord');
const Employee = require('../../../models/Employee');
const { fullName } = require('./helpers');

const slug = 'missed-clock-out';

/**
 * Find employees who missed clock-out today.
 * Recipients: employee only.
 */
const findRecipients = async (companyId, contextData, config) => {
  try {
    const today = new Date();
    const dayStart = startOfDay(today);
    const dayEnd = endOfDay(today);

    const records = await AttendanceRecord.find({
      company_id: companyId,
      date: { $gte: dayStart, $lte: dayEnd },
      missedClockOut: true,
    })
      .select('employee_id date clockInTime')
      .lean();

    if (!records.length) return [];

    // Batch fetch employees
    const employeeIds = [...new Set(records.map((r) => r.employee_id.toString()))];
    const employees = await Employee.find({
      _id: { $in: employeeIds },
      company_id: companyId,
    })
      .select('_id user_id firstName lastName employeeId')
      .lean();

    const empMap = new Map(employees.map((e) => [e._id.toString(), e]));

    const recipients = [];

    for (const record of records) {
      const emp = empMap.get(record.employee_id.toString());
      if (!emp?.user_id) continue;

      recipients.push({
        userId: emp.user_id.toString(),
        recipientType: 'employee',
        variables: {
          employeeName: fullName(emp),
          date: format(new Date(record.date), 'dd MMM yyyy'),
          clockInTime: record.clockInTime
            ? format(new Date(record.clockInTime), 'hh:mm a')
            : 'N/A',
        },
        actionUrl: '/attendance/my',
      });
    }

    return recipients;
  } catch (err) {
    console.error(`[RuleEngine] ${slug} handler error:`, err.message);
    return [];
  }
};

module.exports = { slug, findRecipients };
