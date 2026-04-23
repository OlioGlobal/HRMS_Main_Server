const { differenceInMinutes } = require('date-fns');
const Company         = require('../../../models/Company');
const Location        = require('../../../models/Location');
const Employee        = require('../../../models/Employee');
const WorkPolicy      = require('../../../models/WorkPolicy');
const AttendanceRecord = require('../../../models/AttendanceRecord');

// ─── Timezone helpers (same approach as autoAbsent.job.js) ───────────────────

/**
 * Returns { h, m } — current hour and minute in the given IANA timezone.
 * Uses Intl.formatToParts for reliable parsing across all Node versions.
 */
const getLocalTime = (tz) => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour:     '2-digit',
      minute:   '2-digit',
      hour12:   false,
    }).formatToParts(new Date());
    const h = parseInt(parts.find((p) => p.type === 'hour').value,   10);
    const m = parseInt(parts.find((p) => p.type === 'minute').value, 10);
    return { h, m };
  } catch {
    return { h: -1, m: -1 };
  }
};

/**
 * Returns "YYYY-MM-DD" in the given timezone — for querying attendance records.
 */
const getLocalDateStr = (tz) => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
  } catch {
    return null;
  }
};

/**
 * Returns short day name ("MON"–"SUN") in the given timezone.
 */
const getLocalDayName = (tz) => {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' })
      .format(new Date())
      .toUpperCase()
      .slice(0, 3);
  } catch {
    return null;
  }
};

// ─── Handler ─────────────────────────────────────────────────────────────────

module.exports = {
  slug: 'shift-notification',

  async findRecipients(companyId, _contextData, config) {
    const reminderMinutes = config.reminderMinutes ?? 15;

    // ── 1. Fetch company timezone (fallback) ───────────────────────────────
    const company   = await Company.findById(companyId).select('settings.timezone').lean();
    const companyTZ = company?.settings?.timezone || 'UTC';

    // ── 2. Build location → timezone map ──────────────────────────────────
    const locations = await Location.find({ company_id: companyId, isActive: true })
      .select('_id timezone')
      .lean();

    const locTZMap = new Map();
    for (const loc of locations) {
      locTZMap.set(loc._id.toString(), loc.timezone || companyTZ);
    }

    // ── 3. Fetch work policies ─────────────────────────────────────────────
    const policies = await WorkPolicy.find({ company_id: companyId, isActive: true }).lean();
    if (!policies.length) return [];

    const policyMap = {};
    policies.forEach((p) => { policyMap[p._id.toString()] = p; });

    // ── 4. Fetch active employees (include location_id for timezone) ───────
    const employees = await Employee.find({
      company_id:   companyId,
      status:       'active',
      user_id:      { $ne: null },
      workPolicy_id: { $ne: null },
    }).select('_id user_id firstName lastName employeeId workPolicy_id location_id').lean();

    if (!employees.length) return [];

    // ── 5. Group employees by resolved timezone ────────────────────────────
    const tzGroups = new Map(); // tz → [employee, ...]
    for (const emp of employees) {
      const tz = emp.location_id
        ? (locTZMap.get(emp.location_id.toString()) || companyTZ)
        : companyTZ;
      if (!tzGroups.has(tz)) tzGroups.set(tz, []);
      tzGroups.get(tz).push(emp);
    }

    const now        = new Date();
    const recipients = [];
    const processedKeys = new Set(); // dedup within this run

    // ── 6. Process each timezone group ────────────────────────────────────
    for (const [tz, tzEmployees] of tzGroups) {

      // Current local time in this timezone
      const { h: localH, m: localM } = getLocalTime(tz);
      if (localH === -1) continue;
      const currentMinutes = localH * 60 + localM;

      // Local date string for attendance query
      const todayStr = getLocalDateStr(tz);
      if (!todayStr) continue;
      const todayStart = new Date(todayStr + 'T00:00:00Z');
      const todayEnd   = new Date(todayStr + 'T23:59:59.999Z');

      // Local day name for working-day check
      const localDayName = getLocalDayName(tz);
      if (!localDayName) continue;

      // Attendance records for today (this timezone's date, these employees only)
      const records = await AttendanceRecord.find({
        company_id:  companyId,
        employee_id: { $in: tzEmployees.map((e) => e._id) },
        date:        { $gte: todayStart, $lte: todayEnd },
      }).select('employee_id clockInTime clockOutTime').lean();

      const attMap = {};
      records.forEach((r) => { attMap[r.employee_id.toString()] = r; });

      for (const emp of tzEmployees) {
        const policy = policyMap[emp.workPolicy_id?.toString()];
        if (!policy) continue;

        // Skip non-working days (using timezone-aware day name)
        if (!policy.workingDays.includes(localDayName)) continue;

        const empName = `${emp.firstName} ${emp.lastName}`;
        const uid     = emp.user_id.toString();
        const att     = attMap[emp._id.toString()];

        const [startH, startM] = (policy.workStart || '09:00').split(':').map(Number);
        const [endH,   endM]   = (policy.workEnd   || '18:00').split(':').map(Number);
        const shiftStartMinutes = startH * 60 + startM;
        const shiftEndMinutes   = endH   * 60 + endM;
        const requiredHours     = policy.overtimeThresholdHours || 8;

        // ── Shift Start Reminder ─────────────────────────────────────────
        const minutesToStart = shiftStartMinutes - currentMinutes;
        if (minutesToStart > 0 && minutesToStart <= reminderMinutes && !att?.clockInTime) {
          const key = `start-${uid}-${todayStr}`;
          if (!processedKeys.has(key)) {
            processedKeys.add(key);
            recipients.push({
              userId:        uid,
              recipientType: 'employee',
              variables: {
                employeeName: empName,
                employeeId:   emp.employeeId,
                shiftStart:   policy.workStart,
                shiftEnd:     policy.workEnd,
                requiredHours,
                shiftTitle:   'Shift Starting Soon',
                shiftMessage: `Your shift starts at ${policy.workStart}. ${minutesToStart} minute${minutesToStart === 1 ? '' : 's'} to go!`,
              },
              actionUrl: '/portal',
            });
          }
        }

        // ── Shift End Reminder ───────────────────────────────────────────
        const minutesToEnd = shiftEndMinutes - currentMinutes;
        if (minutesToEnd > 0 && minutesToEnd <= reminderMinutes && att?.clockInTime && !att?.clockOutTime) {
          const key = `end-${uid}-${todayStr}`;
          if (!processedKeys.has(key)) {
            processedKeys.add(key);
            recipients.push({
              userId:        uid,
              recipientType: 'employee',
              variables: {
                employeeName: empName,
                employeeId:   emp.employeeId,
                shiftStart:   policy.workStart,
                shiftEnd:     policy.workEnd,
                requiredHours,
                shiftTitle:   'Shift Ending Soon',
                shiftMessage: `Your shift ends at ${policy.workEnd}. ${minutesToEnd} minute${minutesToEnd === 1 ? '' : 's'} remaining. Don't forget to clock out!`,
              },
              actionUrl: '/portal',
            });
          }
        }

        // ── Hours Completed ──────────────────────────────────────────────
        if (att?.clockInTime && !att?.clockOutTime) {
          const workedMins = differenceInMinutes(now, new Date(att.clockInTime));
          const workedHrs  = workedMins / 60;

          // Notify once — within 15-min window after hitting required hours
          if (workedHrs >= requiredHours && workedHrs < requiredHours + 0.25) {
            const key = `done-${uid}-${todayStr}`;
            if (!processedKeys.has(key)) {
              processedKeys.add(key);
              const hrs  = Math.floor(workedHrs);
              const mins = Math.round(workedMins % 60);
              recipients.push({
                userId:        uid,
                recipientType: 'employee',
                variables: {
                  employeeName: empName,
                  employeeId:   emp.employeeId,
                  shiftStart:   policy.workStart,
                  shiftEnd:     policy.workEnd,
                  requiredHours,
                  shiftTitle:   'Hours Completed',
                  shiftMessage: `Great job! You've completed ${hrs}h ${mins}m today (required: ${requiredHours}h). Don't forget to clock out when you're done!`,
                },
                actionUrl: '/portal',
              });
            }
          }
        }
      }
    }

    return recipients;
  },
};
