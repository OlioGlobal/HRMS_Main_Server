/**
 * Seed Feb 2026 test data for Vishwas Tupe (EMP001)
 *
 * 1. Creates leave request (AL Feb 16) + approves it + updates balance
 *    (Can't use API for past dates due to minDaysNotice check)
 * 2. Seeds 20 attendance records for Feb 2026 working days
 *
 * Run: node scripts/seedFeb2026.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Load models so mongoose knows about them
const LeaveRequest  = require('../src/models/LeaveRequest');
const LeaveBalance  = require('../src/models/LeaveBalance');
const LeaveType     = require('../src/models/LeaveType');
const AttendanceRecord = require('../src/models/AttendanceRecord');

// ─── IDs from DB ──────────────────────────────────────────────────────────────
const COMPANY_ID  = '69b29ae86042f0f297a9da7a';
const EMPLOYEE_ID = '69b2a9b26042f0f297a9dd97';
const ADMIN_ID    = '69b29ae86042f0f297a9da7c';
const AL_TYPE_ID  = '69b29ae96042f0f297a9dbfd';

async function main() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017', {
    dbName: process.env.DB_NAME || 'hrms',
  });

  console.log('\n=== Seeding Feb 2026 Test Data ===\n');

  const companyOid  = new mongoose.Types.ObjectId(COMPANY_ID);
  const employeeOid = new mongoose.Types.ObjectId(EMPLOYEE_ID);
  const adminOid    = new mongoose.Types.ObjectId(ADMIN_ID);
  const alTypeOid   = new mongoose.Types.ObjectId(AL_TYPE_ID);

  // ── Step 1: Create Leave Request (same logic as API) ────────────────────────
  console.log('1. Creating leave request (AL, Feb 16)...');

  // Check no overlap
  const overlap = await LeaveRequest.findOne({
    employee_id: employeeOid,
    status: { $in: ['pending', 'approved'] },
    startDate: { $lte: new Date('2026-02-16') },
    endDate:   { $gte: new Date('2026-02-16') },
  });
  if (overlap) {
    console.log('   Leave request already exists for Feb 16. Skipping.');
  } else {
    // Check balance
    const balance = await LeaveBalance.findOne({
      company_id: companyOid, employee_id: employeeOid,
      leaveType_id: alTypeOid, year: 2026,
    });
    const remaining = balance
      ? balance.allocated + balance.carryForward + balance.adjustment - balance.used - balance.pending
      : 0;
    const isLWP = remaining < 1;

    // Create the request (status: pending first, then approve)
    const leaveReq = await LeaveRequest.create({
      company_id:   companyOid,
      employee_id:  employeeOid,
      leaveType_id: alTypeOid,
      startDate:    new Date('2026-02-16'),
      endDate:      new Date('2026-02-16'),
      totalDays:    1,
      isHalfDay:    false,
      halfDaySession: null,
      reason:       'Family function',
      status:       'pending',
      isLWP,
      appliedAt:    new Date('2026-02-13T10:00:00.000Z'),
    });

    // Reserve balance (pending +1)
    if (balance && !isLWP) {
      balance.pending += 1;
      await balance.save();
    }

    console.log('   Created (pending). ID:', leaveReq._id);
    console.log('   isLWP:', isLWP, '| remaining before:', remaining);

    // ── Step 2: Approve it (same logic as API) ──────────────────────────────
    console.log('2. Approving leave request...');
    leaveReq.status     = 'approved';
    leaveReq.reviewedBy = adminOid;
    leaveReq.reviewedAt = new Date('2026-02-13T12:00:00.000Z');
    leaveReq.reviewNote = 'Approved. Enjoy!';
    await leaveReq.save();

    // Move pending → used
    if (balance && !isLWP) {
      balance.pending = Math.max(0, balance.pending - 1);
      balance.used   += 1;
      await balance.save();
    }

    console.log('   Approved!');
  }

  // ── Step 3: Verify balance ──────────────────────────────────────────────────
  console.log('3. Leave balance check...');
  const balances = await LeaveBalance.find({
    company_id: companyOid, employee_id: employeeOid, year: 2026,
  }).populate('leaveType_id', 'name code').lean();

  for (const b of balances) {
    const rem = b.allocated + b.carryForward + (b.adjustment || 0) - b.used - b.pending;
    console.log(`   ${b.leaveType_id.name} (${b.leaveType_id.code}): allocated=${b.allocated}, used=${b.used}, pending=${b.pending}, remaining=${rem}`);
  }

  // ── Step 4: Seed attendance records ─────────────────────────────────────────
  console.log('4. Seeding attendance records for Feb 2026...');

  // Check if already seeded
  const existingCount = await AttendanceRecord.countDocuments({
    company_id: companyOid, employee_id: employeeOid,
    date: { $gte: new Date('2026-02-01'), $lt: new Date('2026-03-01') },
  });
  if (existingCount > 0) {
    console.log('   Already have ' + existingCount + ' records for Feb 2026. Skipping.');
    await mongoose.disconnect();
    return;
  }

  const wpSnapshot = {
    workStart: '10:00', workEnd: '19:00',
    graceMinutes: 45, lateMarkAfterMinutes: 40,
    halfDayThresholdHours: 4, absentThresholdHours: 2,
    overtimeThresholdHours: 9,
  };

  // IST = UTC+5:30
  const IST_OFFSET = 330;
  function istToUTC(year, month, day, hours, minutes) {
    const d = new Date(Date.UTC(year, month - 1, day, hours, minutes));
    return new Date(d.getTime() - IST_OFFSET * 60 * 1000);
  }

  // Feb 2026 working days (Mon-Fri): 2,3,4,5,6, 9,10,11,12,13, 16,17,18,19,20, 23,24,25,26,27
  // Feb 16 = on_leave (AL)
  // Feb 20 = absent (no show, no leave)
  // Feb 11 = late (11:30 IST, stayed till 20:30)
  // Feb 24 = late (11:15 IST, stayed till 20:15)
  // Feb 25 = half day (came 10:00, left 14:00 — 4 hrs)
  // Rest = present (on time)
  const schedule = [
    [2,  'present'],  [3,  'present'],  [4,  'present'],  [5,  'present'],  [6,  'present'],
    [9,  'present'],  [10, 'present'],  [11, 'late', '11:30', '20:30'],     [12, 'present'],
    [13, 'present'],  [16, 'on_leave'], [17, 'present'],  [18, 'present'],  [19, 'present'],
    [20, 'absent'],   [23, 'present'],  [24, 'late', '11:15', '20:15'],
    [25, 'half_day', '10:00', '14:00'], [26, 'present'],  [27, 'present'],
  ];

  const records = [];

  for (const entry of schedule) {
    const day  = entry[0];
    const type = entry[1];
    const date = new Date(Date.UTC(2026, 1, day));

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
      const inMin = Math.floor(Math.random() * 8);       // 10:00-10:07 IST
      const outMin = Math.floor(Math.random() * 10);      // 19:00-19:09 IST
      rec.clockInTime  = istToUTC(2026, 2, day, 10, inMin);
      rec.clockOutTime = istToUTC(2026, 2, day, 19, outMin);
      rec.totalHours   = Math.round((rec.clockOutTime - rec.clockInTime) / 3600000 * 100) / 100;
      rec.overtimeHours = rec.totalHours > 9 ? Math.round((rec.totalHours - 9) * 100) / 100 : 0;
      rec.clockInType = 'office'; rec.clockOutType = 'office';

    } else if (type === 'late') {
      const [ih, im] = entry[2].split(':').map(Number);
      const [oh, om] = entry[3].split(':').map(Number);
      rec.clockInTime  = istToUTC(2026, 2, day, ih, im);
      rec.clockOutTime = istToUTC(2026, 2, day, oh, om);
      rec.totalHours   = Math.round((rec.clockOutTime - rec.clockInTime) / 3600000 * 100) / 100;
      rec.overtimeHours = rec.totalHours > 9 ? Math.round((rec.totalHours - 9) * 100) / 100 : 0;
      rec.status = 'late'; rec.isLate = true;
      rec.lateByMinutes = (ih - 10) * 60 + im;
      rec.clockInType = 'office'; rec.clockOutType = 'office';

    } else if (type === 'half_day') {
      rec.clockInTime  = istToUTC(2026, 2, day, 10, 0);
      rec.clockOutTime = istToUTC(2026, 2, day, 14, 0);
      rec.totalHours = 4;
      rec.clockInType = 'office'; rec.clockOutType = 'office';
    }
    // absent & on_leave: nulls, status already set

    records.push(rec);
  }

  await AttendanceRecord.insertMany(records);
  console.log('   ' + records.length + ' attendance records created.');

  // ── Summary ─────────────────────────────────────────────────────────────────
  const counts = {};
  schedule.forEach(e => { counts[e[1]] = (counts[e[1]] || 0) + 1; });

  console.log('\n=== Feb 2026 Seeded ===');
  console.log('Leave: 1 day AL (Feb 16) — PAID, approved, NO salary deduction');
  console.log('Attendance:', JSON.stringify(counts));
  console.log('');
  console.log('Expected payroll:');
  console.log('  20 working days | Per day: Rs.1,250');
  console.log('  Gross:       Rs.25,000');
  console.log('  PT:         -Rs.200');
  console.log('  Absent(1):  -Rs.1,250');
  console.log('  HalfDay(1): -Rs.625');
  console.log('  AL(paid):    Rs.0');
  console.log('  Late:        Rs.0 (disabled)');
  console.log('  ─────────────────');
  console.log('  Net pay:     Rs.22,925');
  console.log('\nNow run payroll for Feb 2026 from the UI!');

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Error:', err.message || err);
  process.exit(1);
});
