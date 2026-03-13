/**
 * Auto-Absent Cron Job
 *
 * Runs every hour. Processes per-company, resolves each employee's timezone
 * from their location (fallback: company timezone). Only processes employees
 * whose local time has reached 23:00 (end of day).
 *
 * For employees without an attendance record today:
 *   - Weekend (per work policy)  → skip (no record)
 *   - Public holiday             → status: holiday
 *   - Approved leave             → status: on_leave
 *   - None of the above          → status: absent
 *
 * Also marks missedClockOut for employees who clocked in but didn't clock out.
 */

const AttendanceRecord = require('../../models/AttendanceRecord');
const Employee         = require('../../models/Employee');
const WorkPolicy       = require('../../models/WorkPolicy');
const Location         = require('../../models/Location');
const Company          = require('../../models/Company');
const LeaveRequest     = require('../../models/LeaveRequest');
const PublicHoliday    = require('../../models/PublicHoliday');
const { log }          = require('../runner');

// ─── Timezone helpers ────────────────────────────────────────────────────────

const getCurrentHourInTZ = (tz) => {
  try {
    const str = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour: 'numeric', hour12: false,
    }).format(new Date());
    return parseInt(str, 10);
  } catch {
    return -1;
  }
};

const getTodayInTZ = (tz) => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date()); // "YYYY-MM-DD"
  } catch {
    return null;
  }
};

const getDayNameInTZ = (tz) => {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' })
      .format(new Date()).toUpperCase().slice(0, 3); // "MON", "TUE", …
  } catch {
    return null;
  }
};

// ─── Main ────────────────────────────────────────────────────────────────────

const run = async () => {
  let totalProcessed = 0;
  let totalCreated   = 0;
  let totalMissed    = 0;

  // 1. Get all companies
  const companies = await Company.find().lean();

  for (const company of companies) {
    const companyId   = company._id;
    const companyTZ   = company.settings?.timezone || 'UTC';

    // 2. Build location timezone map for this company
    const locations = await Location.find({ company_id: companyId, isActive: true }).lean();
    const locTZMap = new Map(); // locationId → timezone
    for (const loc of locations) {
      locTZMap.set(loc._id.toString(), loc.timezone || companyTZ);
    }

    // 3. Get active employees
    const employees = await Employee.find({ company_id: companyId, status: 'active' }).lean();
    if (!employees.length) continue;

    // 4. Resolve each employee's timezone and filter those at 23:00
    // Group employees by their resolved timezone
    const tzGroups = new Map(); // timezone → [employee, ...]

    for (const emp of employees) {
      const empTZ = emp.location_id
        ? (locTZMap.get(emp.location_id.toString()) || companyTZ)
        : companyTZ;

      if (getCurrentHourInTZ(empTZ) !== 23) continue;

      if (!tzGroups.has(empTZ)) tzGroups.set(empTZ, []);
      tzGroups.get(empTZ).push(emp);
    }

    if (tzGroups.size === 0) {
      log('INFO', `auto-absent | ${company.name || companyId} — no employees at 23:00 right now, skipping`);
      continue;
    }

    // 5. Cache work policies
    const policies = await WorkPolicy.find({ company_id: companyId }).lean();
    const policyMap = new Map();
    policies.forEach((p) => policyMap.set(p._id.toString(), p));
    const defaultPolicy = policies.find((p) => p.isDefault);

    // 6. Process each timezone group separately (each may have a different date)
    for (const [tz, tzEmployees] of tzGroups) {
      const todayStr = getTodayInTZ(tz);
      if (!todayStr) continue;
      const todayDate = new Date(todayStr + 'T00:00:00Z');
      const year      = todayDate.getUTCFullYear();

      log('INFO', `auto-absent | ${company.name || companyId} | TZ: ${tz} | date: ${todayStr} | employees: ${tzEmployees.length}`);

      // Get today's holidays for this timezone's date
      const holidays = await PublicHoliday.find({
        company_id: companyId,
        year,
        isActive: true,
        isOptional: false,
        date: todayDate,
      }).lean();

      // Get existing attendance records for today
      const existingRecords = await AttendanceRecord.find({
        company_id: companyId,
        date: todayDate,
        employee_id: { $in: tzEmployees.map((e) => e._id) },
      }).lean();
      const recordedIds = new Set(existingRecords.map((r) => r.employee_id.toString()));

      // Get approved leaves covering today
      const leaves = await LeaveRequest.find({
        company_id: companyId,
        status: 'approved',
        startDate: { $lte: todayDate },
        endDate:   { $gte: todayDate },
      }).lean();
      // Full-day leaves → on_leave; half-day leaves → employee still expected to work other half
      const onLeaveIds = new Set();
      const halfDayLeaveIds = new Set();
      for (const l of leaves) {
        const eid = l.employee_id.toString();
        if (l.isHalfDay) {
          halfDayLeaveIds.add(eid);
        } else {
          onLeaveIds.add(eid);
        }
      }

      // Build records to insert
      const toInsert = [];

      for (const emp of tzEmployees) {
        const empId = emp._id.toString();
        totalProcessed++;

        if (recordedIds.has(empId)) continue;

        // Resolve policy
        const policy = emp.workPolicy_id
          ? policyMap.get(emp.workPolicy_id.toString())
          : defaultPolicy;
        if (!policy) continue;

        // Weekend check using the employee's timezone day name
        const dayName = getDayNameInTZ(tz);
        if (dayName && !policy.workingDays.includes(dayName)) continue;

        // Holiday check — company-wide or matching employee's location
        const isHoliday = holidays.some((h) => {
          if (!h.location_id) return true; // Company-wide holiday
          if (!emp.location_id) return false; // Employee has no location, skip location-specific
          return h.location_id.toString() === emp.location_id.toString();
        });

        if (isHoliday) {
          toInsert.push({ company_id: companyId, employee_id: emp._id, date: todayDate, status: 'holiday' });
          continue;
        }

        // Full-day leave check
        if (onLeaveIds.has(empId)) {
          toInsert.push({ company_id: companyId, employee_id: emp._id, date: todayDate, status: 'on_leave' });
          continue;
        }

        // Half-day leave but no clock-in → mark half_day (worked 0 hours but has half-day leave)
        if (halfDayLeaveIds.has(empId)) {
          toInsert.push({ company_id: companyId, employee_id: emp._id, date: todayDate, status: 'half_day' });
          continue;
        }

        // Absent
        toInsert.push({ company_id: companyId, employee_id: emp._id, date: todayDate, status: 'absent' });
      }

      // Bulk insert (ignore duplicates)
      if (toInsert.length > 0) {
        const statusCounts = {};
        toInsert.forEach(r => { statusCounts[r.status] = (statusCounts[r.status] || 0) + 1; });
        log('INFO', `auto-absent | ${company.name || companyId} | inserting ${toInsert.length} records: ${JSON.stringify(statusCounts)}`);

        try {
          await AttendanceRecord.insertMany(toInsert, { ordered: false });
          totalCreated += toInsert.length;
        } catch (err) {
          if (err.code === 11000 || err.name === 'MongoBulkWriteError') {
            const inserted = err.result?.nInserted ?? 0;
            totalCreated += inserted;
            log('INFO', `auto-absent | ${company.name || companyId} | ${toInsert.length - inserted} duplicates skipped`);
          } else {
            throw err;
          }
        }
      } else {
        log('INFO', `auto-absent | ${company.name || companyId} | TZ: ${tz} — all employees already have records, nothing to insert`);
      }

      // Mark missed clock-outs for this timezone group
      const missedResult = await AttendanceRecord.updateMany(
        {
          company_id: companyId,
          date: todayDate,
          employee_id: { $in: tzEmployees.map((e) => e._id) },
          clockInTime: { $ne: null },
          clockOutTime: null,
          missedClockOut: false,
        },
        { $set: { missedClockOut: true } },
      );
      if (missedResult.modifiedCount > 0) {
        log('INFO', `auto-absent | ${company.name || companyId} | marked ${missedResult.modifiedCount} missed clock-outs`);
      }
      totalMissed += missedResult.modifiedCount;
    }
  }

  return `processed=${totalProcessed}, created=${totalCreated}, missedClockOut=${totalMissed}`;
};

module.exports = { run };
