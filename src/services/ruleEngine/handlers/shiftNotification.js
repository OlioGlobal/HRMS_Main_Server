const { format, differenceInMinutes } = require('date-fns');
const Employee = require('../../../models/Employee');
const WorkPolicy = require('../../../models/WorkPolicy');
const AttendanceRecord = require('../../../models/AttendanceRecord');

module.exports = {
  slug: 'shift-notification',

  async findRecipients(companyId, _contextData, config) {
    const reminderMinutes = config.reminderMinutes ?? 15;

    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    const currentHH = String(now.getHours()).padStart(2, '0');
    const currentMM = String(now.getMinutes()).padStart(2, '0');
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const todayDay = dayNames[now.getDay()];

    // Get all active work policies for this company
    const policies = await WorkPolicy.find({ company_id: companyId, isActive: true }).lean();
    if (!policies.length) return [];

    // Get all active employees with portal access
    const employees = await Employee.find({
      company_id: companyId,
      status: 'active',
      user_id: { $ne: null },
      workPolicy_id: { $ne: null },
    }).select('_id user_id firstName lastName employeeId workPolicy_id').lean();

    if (!employees.length) return [];

    // Group employees by work policy
    const policyMap = {};
    policies.forEach(p => { policyMap[p._id.toString()] = p; });

    // Get today's attendance records for all employees
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);
    const attendanceRecords = await AttendanceRecord.find({
      company_id: companyId,
      date: { $gte: today, $lte: todayEnd },
    }).select('employee_id clockInTime clockOutTime totalHours').lean();

    const attMap = {};
    attendanceRecords.forEach(r => { attMap[r.employee_id.toString()] = r; });

    const recipients = [];
    const processedKeys = new Set();

    for (const emp of employees) {
      const policy = policyMap[emp.workPolicy_id?.toString()];
      if (!policy) continue;

      // Skip if not a working day
      if (!policy.workingDays.includes(todayDay)) continue;

      const empName = `${emp.firstName} ${emp.lastName}`;
      const uid = emp.user_id.toString();
      const att = attMap[emp._id.toString()];

      // Parse shift times
      const [startH, startM] = (policy.workStart || '09:00').split(':').map(Number);
      const [endH, endM] = (policy.workEnd || '18:00').split(':').map(Number);
      const shiftStartMinutes = startH * 60 + startM;
      const shiftEndMinutes = endH * 60 + endM;
      const requiredHours = policy.overtimeThresholdHours || 8;

      // 1. Shift Start Reminder — X minutes before shift start, only if not clocked in yet
      const minutesToStart = shiftStartMinutes - currentMinutes;
      if (minutesToStart > 0 && minutesToStart <= reminderMinutes && !att?.clockInTime) {
        const key = `start-${uid}`;
        if (!processedKeys.has(key)) {
          processedKeys.add(key);
          recipients.push({
            userId: uid,
            recipientType: 'employee',
            variables: {
              employeeName: empName,
              employeeId: emp.employeeId,
              shiftStart: policy.workStart,
              shiftEnd: policy.workEnd,
              requiredHours,
              shiftTitle: 'Shift Starting Soon',
              shiftMessage: `Your shift starts at ${policy.workStart}. ${minutesToStart} minutes to go!`,
            },
            actionUrl: '/portal',
          });
        }
      }

      // 2. Shift End Reminder — X minutes before shift end, only if clocked in and not clocked out
      const minutesToEnd = shiftEndMinutes - currentMinutes;
      if (minutesToEnd > 0 && minutesToEnd <= reminderMinutes && att?.clockInTime && !att?.clockOutTime) {
        const key = `end-${uid}`;
        if (!processedKeys.has(key)) {
          processedKeys.add(key);
          recipients.push({
            userId: uid,
            recipientType: 'employee',
            variables: {
              employeeName: empName,
              employeeId: emp.employeeId,
              shiftStart: policy.workStart,
              shiftEnd: policy.workEnd,
              requiredHours,
              shiftTitle: 'Shift Ending Soon',
              shiftMessage: `Your shift ends at ${policy.workEnd}. ${minutesToEnd} minutes remaining. Don't forget to clock out!`,
            },
            actionUrl: '/portal',
          });
        }
      }

      // 3. Hours Completed — clocked in, not clocked out, worked >= required hours
      if (att?.clockInTime && !att?.clockOutTime) {
        const clockInTime = new Date(att.clockInTime);
        const workedMins = differenceInMinutes(now, clockInTime);
        const workedHrs = workedMins / 60;

        // Notify when they've completed required hours (within 15 min window to avoid re-notifying)
        if (workedHrs >= requiredHours && workedHrs < requiredHours + 0.25) {
          const key = `done-${uid}`;
          if (!processedKeys.has(key)) {
            processedKeys.add(key);
            const hrs = Math.floor(workedHrs);
            const mins = Math.round(workedMins % 60);
            recipients.push({
              userId: uid,
              recipientType: 'employee',
              variables: {
                employeeName: empName,
                employeeId: emp.employeeId,
                shiftStart: policy.workStart,
                shiftEnd: policy.workEnd,
                requiredHours,
                shiftTitle: 'Hours Completed',
                shiftMessage: `Great job! You've completed ${hrs}h ${mins}m today (required: ${requiredHours}h). Don't forget to clock out when you're done!`,
              },
              actionUrl: '/portal',
            });
          }
        }
      }
    }

    return recipients;
  },
};
