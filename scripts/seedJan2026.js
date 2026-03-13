/**
 * Seed Jan 2026 test data for Vishwas Tupe (EMP001)
 *
 * 1. Creates 2 public holidays: Jan 1 (New Year), Jan 26 (Republic Day)
 * 2. Creates 1 leave request (SL Jan 15) + approves + updates balance
 * 3. Seeds attendance for Jan 2026 working days (excluding holidays + weekends)
 *
 * Jan 2026 calendar:
 *   Thu Jan 1  = HOLIDAY (New Year)
 *   Fri Jan 2  = working
 *   Sat-Sun    = weekend
 *   Mon Jan 5 - Fri Jan 9  = working (5)
 *   Mon Jan 12 - Wed Jan 14 = working (3)
 *   Thu Jan 15 = ON LEAVE (SL)
 *   Fri Jan 16 = working
 *   Mon Jan 19 - Fri Jan 23 = working (5)
 *   Mon Jan 26 = HOLIDAY (Republic Day)
 *   Tue Jan 27 - Fri Jan 30 = working (4)
 *
 *   Total working days: 22 calendar - 2 holidays = 20 working days
 *   Pattern: 16 present, 2 late, 1 absent, 1 half_day, 1 on_leave (SL)
 *
 * Run: node scripts/seedJan2026.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const PublicHoliday    = require('../src/models/PublicHoliday');
const LeaveRequest     = require('../src/models/LeaveRequest');
const LeaveBalance     = require('../src/models/LeaveBalance');
const LeaveType        = require('../src/models/LeaveType');
const AttendanceRecord = require('../src/models/AttendanceRecord');
const Employee         = require('../src/models/Employee');
const User             = require('../src/models/User');

const IST_OFFSET = 330;
function istToUTC(year, month, day, hours, minutes) {
  const d = new Date(Date.UTC(year, month - 1, day, hours, minutes));
  return new Date(d.getTime() - IST_OFFSET * 60 * 1000);
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017', {
    dbName: process.env.DB_NAME || 'hrms',
  });
  console.log('\n=== Seeding Jan 2026 Test Data ===\n');

  // Find employee dynamically
  const employee = await Employee.findOne({ employeeId: 'EMP001' }).lean();
  if (!employee) { console.log('EMP001 not found!'); await mongoose.disconnect(); return; }

  const companyId  = employee.company_id;
  const employeeId = employee._id;

  const admin = await User.findOne({ company_id: companyId }).sort({ createdAt: 1 }).lean();
  if (!admin) { console.log('Admin not found!'); await mongoose.disconnect(); return; }

  // ── 1. Create Holidays ─────────────────────────────────────────────────────
  console.log('1. Creating public holidays...');

  const holidaysToCreate = [
    { name: "New Year's Day", date: new Date(Date.UTC(2026, 0, 1)), type: 'national' },
    { name: 'Republic Day', date: new Date(Date.UTC(2026, 0, 26)), type: 'national' },
  ];

  for (const h of holidaysToCreate) {
    const exists = await PublicHoliday.findOne({
      company_id: companyId, date: h.date, location_id: null,
    });
    if (exists) {
      console.log(`   ${h.name} already exists. Skipping.`);
    } else {
      await PublicHoliday.create({
        company_id: companyId,
        location_id: null, // company-wide
        name: h.name,
        date: h.date,
        year: 2026,
        type: h.type,
        isOptional: false,
        isActive: true,
        source: 'manual',
      });
      console.log(`   Created: ${h.name} (Jan ${h.date.getUTCDate()})`);
    }
  }

  // ── 2. Create Leave Request (SL Jan 15) ─────────────────────────────────────
  console.log('2. Creating leave request (SL, Jan 15)...');

  const slType = await LeaveType.findOne({ company_id: companyId, code: 'SL' }).lean();
  if (!slType) { console.log('   SL leave type not found!'); }
  else {
    const leaveDate = new Date(Date.UTC(2026, 0, 15));
    const overlap = await LeaveRequest.findOne({
      employee_id: employeeId,
      status: { $in: ['pending', 'approved'] },
      startDate: { $lte: leaveDate },
      endDate:   { $gte: leaveDate },
    });

    if (overlap) {
      console.log('   Leave already exists for Jan 15. Skipping.');
    } else {
      const balance = await LeaveBalance.findOne({
        company_id: companyId, employee_id: employeeId,
        leaveType_id: slType._id, year: 2026,
      });
      const remaining = balance
        ? balance.allocated + balance.carryForward + (balance.adjustment || 0) - balance.used - balance.pending
        : 0;
      const isLWP = remaining < 1;

      const leaveReq = await LeaveRequest.create({
        company_id: companyId,
        employee_id: employeeId,
        leaveType_id: slType._id,
        startDate: leaveDate,
        endDate: leaveDate,
        totalDays: 1,
        isHalfDay: false,
        halfDaySession: null,
        reason: 'Fever and body ache',
        status: 'pending',
        isLWP,
        appliedAt: new Date('2026-01-15T04:00:00.000Z'),
      });

      if (balance && !isLWP) { balance.pending += 1; await balance.save(); }

      // Approve
      leaveReq.status = 'approved';
      leaveReq.reviewedBy = admin._id;
      leaveReq.reviewedAt = new Date('2026-01-15T06:00:00.000Z');
      leaveReq.reviewNote = 'Get well soon';
      await leaveReq.save();

      if (balance && !isLWP) {
        balance.pending = Math.max(0, balance.pending - 1);
        balance.used += 1;
        await balance.save();
      }
      console.log(`   SL Jan 15 — ${isLWP ? 'LWP' : 'PAID'} ✓`);
    }
  }

  // ── 3. Seed Attendance ────────────────────────────────────────────────────
  console.log('3. Seeding attendance for Jan 2026...');

  const existingCount = await AttendanceRecord.countDocuments({
    company_id: companyId, employee_id: employeeId,
    date: { $gte: new Date('2026-01-01'), $lt: new Date('2026-02-01') },
  });
  if (existingCount > 0) {
    console.log(`   Already ${existingCount} records. Skipping.`);
    await mongoose.disconnect();
    return;
  }

  const wpSnapshot = {
    workStart: '10:00', workEnd: '19:00',
    graceMinutes: 45, lateMarkAfterMinutes: 40,
    halfDayThresholdHours: 4, absentThresholdHours: 2,
    overtimeThresholdHours: 9,
  };

  // Jan 2026 working days (Mon-Fri), excluding Jan 1 (holiday) and Jan 26 (holiday)
  // Jan 1 = Thu (HOLIDAY), Jan 2 = Fri
  // Jan 3-4 = Sat-Sun
  // Jan 5-9 = Mon-Fri
  // Jan 10-11 = Sat-Sun
  // Jan 12-16 = Mon-Fri (Jan 15 = on_leave)
  // Jan 17-18 = Sat-Sun
  // Jan 19-23 = Mon-Fri
  // Jan 24-25 = Sat-Sun
  // Jan 26 = Mon (HOLIDAY)
  // Jan 27-30 = Tue-Fri
  // Jan 31 = Sat
  //
  // Working days: 2, 5,6,7,8,9, 12,13,14,15,16, 19,20,21,22,23, 27,28,29,30 = 20 days
  // Jan 15 = on_leave (SL)
  // Jan 7 = late
  // Jan 22 = late
  // Jan 9 = absent
  // Jan 28 = half_day

  const schedule = [
    [2,  'present'],
    [5,  'present'],  [6,  'present'],  [7,  'late', '11:20', '20:20'],
    [8,  'present'],  [9,  'absent'],
    [12, 'present'],  [13, 'present'],  [14, 'present'],
    [15, 'on_leave'], [16, 'present'],
    [19, 'present'],  [20, 'present'],  [21, 'present'],
    [22, 'late', '11:05', '20:05'],     [23, 'present'],
    [27, 'present'],  [28, 'half_day', '10:00', '14:15'],
    [29, 'present'],  [30, 'present'],
  ];

  const records = [];

  for (const entry of schedule) {
    const day  = entry[0];
    const type = entry[1];
    const date = new Date(Date.UTC(2026, 0, day));

    const rec = {
      company_id: companyId, employee_id: employeeId, date,
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
      rec.clockInTime  = istToUTC(2026, 1, day, 10, inMin);
      rec.clockOutTime = istToUTC(2026, 1, day, 19, outMin);
      rec.totalHours   = Math.round((rec.clockOutTime - rec.clockInTime) / 3600000 * 100) / 100;
      rec.overtimeHours = rec.totalHours > 9 ? Math.round((rec.totalHours - 9) * 100) / 100 : 0;
      rec.clockInType = 'office'; rec.clockOutType = 'office';

    } else if (type === 'late') {
      const [ih, im] = entry[2].split(':').map(Number);
      const [oh, om] = entry[3].split(':').map(Number);
      rec.clockInTime  = istToUTC(2026, 1, day, ih, im);
      rec.clockOutTime = istToUTC(2026, 1, day, oh, om);
      rec.totalHours   = Math.round((rec.clockOutTime - rec.clockInTime) / 3600000 * 100) / 100;
      rec.overtimeHours = rec.totalHours > 9 ? Math.round((rec.totalHours - 9) * 100) / 100 : 0;
      rec.isLate = true;
      rec.lateByMinutes = (ih - 10) * 60 + im;
      rec.clockInType = 'office'; rec.clockOutType = 'office';

    } else if (type === 'half_day') {
      const [ih, im] = entry[2].split(':').map(Number);
      const [oh, om] = entry[3].split(':').map(Number);
      rec.clockInTime  = istToUTC(2026, 1, day, ih, im);
      rec.clockOutTime = istToUTC(2026, 1, day, oh, om);
      rec.totalHours   = Math.round((rec.clockOutTime - rec.clockInTime) / 3600000 * 100) / 100;
      rec.clockInType = 'office'; rec.clockOutType = 'office';
    }

    records.push(rec);
  }

  await AttendanceRecord.insertMany(records);

  const counts = {};
  schedule.forEach(e => { counts[e[1]] = (counts[e[1]] || 0) + 1; });

  console.log(`   ${records.length} records created — ${JSON.stringify(counts)}`);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n=== Jan 2026 Summary ===');
  console.log('Holidays: Jan 1 (New Year), Jan 26 (Republic Day) — NOT working days');
  console.log('Leave: 1 day SL (Jan 15) — PAID');
  console.log('Attendance:', JSON.stringify(counts));
  console.log('');
  console.log('Expected payroll (CTC Rs.25,000):');
  console.log('  22 weekdays - 2 holidays = 20 working days');
  console.log('  Per day: Rs.1,250');
  console.log('  Gross:       Rs.25,000');
  console.log('  PT:         -Rs.200');
  console.log('  Absent(1):  -Rs.1,250');
  console.log('  HalfDay(1): -Rs.625');
  console.log('  SL(paid):    Rs.0');
  console.log('  Late:        Rs.0 (disabled)');
  console.log('  ─────────────────');
  console.log('  Net pay:     Rs.22,925');
  console.log('\nNow run payroll for Jan 2026 from the UI!');

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Error:', err.message || err);
  process.exit(1);
});
