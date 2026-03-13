/**
 * Seed Feb 2026 test data for ALL employees on production DB
 *
 * For each employee:
 *   - Applies 1 leave (AL or SL) on different dates, approves it, updates balance
 *   - Creates 20 attendance records (Feb working days)
 *   - Mix: mostly present, some late, 1 absent, 1 half_day, 1 on_leave
 *
 * Run: node scripts/seedProdFeb2026.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const Employee        = require('../src/models/Employee');
const LeaveRequest    = require('../src/models/LeaveRequest');
const LeaveBalance    = require('../src/models/LeaveBalance');
const LeaveType       = require('../src/models/LeaveType');
const AttendanceRecord = require('../src/models/AttendanceRecord');
const User            = require('../src/models/User');

// IST = UTC+5:30
const IST_OFFSET = 330;
function istToUTC(year, month, day, hours, minutes) {
  const d = new Date(Date.UTC(year, month - 1, day, hours, minutes));
  return new Date(d.getTime() - IST_OFFSET * 60 * 1000);
}

// Feb 2026 working days (Mon-Fri)
const FEB_WORKING_DAYS = [2,3,4,5,6, 9,10,11,12,13, 16,17,18,19,20, 23,24,25,26,27];

// Different schedules per employee (by index)
// Each: [day, status, clockInTime?, clockOutTime?]
const SCHEDULES = [
  // EMP001 (Developer) — leave Feb 16, late Feb 11 & 24, absent Feb 20, half_day Feb 25
  {
    leaveDay: 16, leaveCode: 'AL', leaveReason: 'Family function',
    pattern: {
      11: ['late', '11:30', '20:30'],
      20: ['absent'],
      24: ['late', '11:15', '20:15'],
      25: ['half_day', '10:00', '14:00'],
    },
  },
  // EMP002 (Accounting Manager) — leave Feb 10, late Feb 5, absent Feb 27, half_day Feb 19
  {
    leaveDay: 10, leaveCode: 'SL', leaveReason: 'Not feeling well',
    pattern: {
      5:  ['late', '11:00', '20:00'],
      19: ['half_day', '10:00', '14:30'],
      27: ['absent'],
    },
  },
  // EMP003 (HR Staff) — leave Feb 23, late Feb 3 & 13, absent Feb 6
  {
    leaveDay: 23, leaveCode: 'AL', leaveReason: 'Personal work',
    pattern: {
      3:  ['late', '10:55', '19:55'],
      6:  ['absent'],
      13: ['late', '11:10', '20:10'],
    },
  },
  // EMP004 (HR Manager) — leave Feb 17, late Feb 9, half_day Feb 26
  {
    leaveDay: 17, leaveCode: 'AL', leaveReason: 'Doctor appointment',
    pattern: {
      9:  ['late', '11:20', '20:20'],
      26: ['half_day', '10:00', '14:15'],
    },
  },
];

const wpSnapshot = {
  workStart: '10:00', workEnd: '19:00',
  graceMinutes: 45, lateMarkAfterMinutes: 40,
  halfDayThresholdHours: 4, absentThresholdHours: 2,
  overtimeThresholdHours: 9,
};

async function seedForEmployee(emp, schedule, leaveTypes, adminUser) {
  const companyOid  = emp.company_id;
  const employeeOid = emp._id;

  console.log(`\n── ${emp.firstName} ${emp.lastName} (${emp.employeeId}) ──`);

  // ─── 1. Create & approve leave ──────────────────────────────────────────────
  const leaveType = leaveTypes.find(t => t.code === schedule.leaveCode);
  if (!leaveType) {
    console.log(`   WARNING: Leave type ${schedule.leaveCode} not found. Skipping leave.`);
  } else {
    const leaveDate = new Date(Date.UTC(2026, 1, schedule.leaveDay));

    const overlap = await LeaveRequest.findOne({
      employee_id: employeeOid,
      status: { $in: ['pending', 'approved'] },
      startDate: { $lte: leaveDate },
      endDate:   { $gte: leaveDate },
    });

    if (overlap) {
      console.log(`   Leave already exists for Feb ${schedule.leaveDay}. Skipping.`);
    } else {
      const balance = await LeaveBalance.findOne({
        company_id: companyOid, employee_id: employeeOid,
        leaveType_id: leaveType._id, year: 2026,
      });

      const remaining = balance
        ? balance.allocated + balance.carryForward + (balance.adjustment || 0) - balance.used - balance.pending
        : 0;
      const isLWP = remaining < 1;

      const leaveReq = await LeaveRequest.create({
        company_id:   companyOid,
        employee_id:  employeeOid,
        leaveType_id: leaveType._id,
        startDate:    leaveDate,
        endDate:      leaveDate,
        totalDays:    1,
        isHalfDay:    false,
        halfDaySession: null,
        reason:       schedule.leaveReason,
        status:       'pending',
        isLWP,
        appliedAt:    new Date(`2026-02-${String(schedule.leaveDay - 3).padStart(2, '0')}T10:00:00.000Z`),
      });

      // Reserve balance
      if (balance && !isLWP) {
        balance.pending += 1;
        await balance.save();
      }

      // Approve
      leaveReq.status     = 'approved';
      leaveReq.reviewedBy = adminUser._id;
      leaveReq.reviewedAt = new Date(`2026-02-${String(schedule.leaveDay - 2).padStart(2, '0')}T12:00:00.000Z`);
      leaveReq.reviewNote = 'Approved';
      await leaveReq.save();

      if (balance && !isLWP) {
        balance.pending = Math.max(0, balance.pending - 1);
        balance.used   += 1;
        await balance.save();
      }

      console.log(`   Leave: ${schedule.leaveCode} Feb ${schedule.leaveDay} — ${isLWP ? 'LWP (no balance)' : 'PAID'} ✓`);
    }
  }

  // ─── 2. Seed attendance ─────────────────────────────────────────────────────
  const existingCount = await AttendanceRecord.countDocuments({
    company_id: companyOid, employee_id: employeeOid,
    date: { $gte: new Date('2026-02-01'), $lt: new Date('2026-03-01') },
  });

  if (existingCount > 0) {
    console.log(`   Already ${existingCount} attendance records. Skipping.`);
    return;
  }

  const records = [];

  for (const day of FEB_WORKING_DAYS) {
    const date = new Date(Date.UTC(2026, 1, day));
    const special = schedule.pattern[day];

    let type;
    if (day === schedule.leaveDay) {
      type = 'on_leave';
    } else if (special) {
      type = special[0];
    } else {
      type = 'present';
    }

    const rec = {
      company_id: companyOid, employee_id: employeeOid, date,
      clockInTime: null, clockOutTime: null,
      clockInType: null, clockOutType: null,
      clockInLat: null, clockInLng: null, clockOutLat: null, clockOutLng: null,
      totalHours: 0, overtimeHours: 0,
      status: type, isLate: false, lateByMinutes: 0,
      missedClockOut: false, isManualOverride: false,
      overrideReason: null, overrideBy: null,
      workPolicySnapshot: wpSnapshot,
    };

    if (type === 'present') {
      const inMin = Math.floor(Math.random() * 8);
      const outMin = Math.floor(Math.random() * 10);
      rec.clockInTime  = istToUTC(2026, 2, day, 10, inMin);
      rec.clockOutTime = istToUTC(2026, 2, day, 19, outMin);
      rec.totalHours   = Math.round((rec.clockOutTime - rec.clockInTime) / 3600000 * 100) / 100;
      rec.overtimeHours = rec.totalHours > 9 ? Math.round((rec.totalHours - 9) * 100) / 100 : 0;
      rec.clockInType = 'office'; rec.clockOutType = 'office';

    } else if (type === 'late') {
      const [ih, im] = special[1].split(':').map(Number);
      const [oh, om] = special[2].split(':').map(Number);
      rec.clockInTime  = istToUTC(2026, 2, day, ih, im);
      rec.clockOutTime = istToUTC(2026, 2, day, oh, om);
      rec.totalHours   = Math.round((rec.clockOutTime - rec.clockInTime) / 3600000 * 100) / 100;
      rec.overtimeHours = rec.totalHours > 9 ? Math.round((rec.totalHours - 9) * 100) / 100 : 0;
      rec.isLate = true;
      rec.lateByMinutes = (ih - 10) * 60 + im;
      rec.clockInType = 'office'; rec.clockOutType = 'office';

    } else if (type === 'half_day') {
      const [ih, im] = special[1].split(':').map(Number);
      const [oh, om] = special[2].split(':').map(Number);
      rec.clockInTime  = istToUTC(2026, 2, day, ih, im);
      rec.clockOutTime = istToUTC(2026, 2, day, oh, om);
      rec.totalHours   = Math.round((rec.clockOutTime - rec.clockInTime) / 3600000 * 100) / 100;
      rec.clockInType = 'office'; rec.clockOutType = 'office';
    }
    // absent & on_leave: no clock times

    records.push(rec);
  }

  await AttendanceRecord.insertMany(records);

  const counts = {};
  records.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
  console.log(`   Attendance: ${records.length} records —`, JSON.stringify(counts));
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI, {
    dbName: process.env.DB_NAME || 'hrms',
  });
  console.log('Connected to DB:', process.env.MONGO_URI.split('@')[1]?.split('/')[0]);

  console.log('\n=== Seeding Feb 2026 Test Data (All Employees) ===');

  // Find all employees (ordered by employeeId)
  const employees = await Employee.find({}).sort({ employeeId: 1 }).lean();
  console.log(`Found ${employees.length} employees`);

  if (employees.length === 0) {
    console.log('No employees found. Exiting.');
    await mongoose.disconnect();
    return;
  }

  // Get leave types for the company
  const leaveTypes = await LeaveType.find({
    company_id: employees[0].company_id,
  }).lean();
  console.log(`Found ${leaveTypes.length} leave types:`, leaveTypes.map(t => t.code).join(', '));

  // Find admin user (for approving leaves)
  const adminUser = await User.findOne({ company_id: employees[0].company_id }).sort({ createdAt: 1 }).lean();
  if (!adminUser) {
    console.log('No admin user found. Exiting.');
    await mongoose.disconnect();
    return;
  }
  console.log(`Admin user: ${adminUser.email}`);

  // Seed each employee
  for (let i = 0; i < employees.length; i++) {
    const schedule = SCHEDULES[i] || SCHEDULES[0]; // fallback to first schedule if more than 4 employees
    await seedForEmployee(employees[i], schedule, leaveTypes, adminUser);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n=== Done! ===');
  console.log('Each employee has:');
  console.log('  - 1 approved leave (paid AL or SL)');
  console.log('  - 20 attendance records for Feb 2026');
  console.log('  - Mix: present, late, absent, half_day, on_leave');
  console.log('\nNow run payroll for Feb 2026 from the UI!');

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Error:', err.message || err);
  process.exit(1);
});
