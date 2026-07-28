/**
 * Leave ↔ Attendance conflict guards.
 *  - full-day leave + a clocked-in day → blocked (both directions)
 *  - half-day leave + working → allowed (works the other half)
 * Real services + helper, local MongoDB, under IST. Self-skips if no DB.
 */
const test     = require('node:test');
const assert   = require('node:assert');
const mongoose = require('mongoose');

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'a'.repeat(64);

const Company          = require('../src/models/Company');
const Employee         = require('../src/models/Employee');
const LeaveType        = require('../src/models/LeaveType');
const LeaveBalance     = require('../src/models/LeaveBalance');
const LeaveRequest     = require('../src/models/LeaveRequest');
const AttendanceRecord = require('../src/models/AttendanceRecord');
const svc              = require('../src/services/leave/leaveRequest.service');
const { findApprovedLeaveOnDay, findWorkedDayInRange } = require('../src/utils/leaveAttendanceLink');
const { parseCivil }   = require('../src/utils/civilDate');

const YEAR = 2026;
let connected = false;
let company, emp;

const apply = (typeId, startDate, endDate, extra = {}) =>
  svc.applyLeave(company._id, emp._id, { leaveType_id: typeId, startDate, endDate, ...extra });
const clearLeaves = () => LeaveRequest.deleteMany({ company_id: company._id });

let AL;

test.before(async () => {
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/hrms_leaveatt_test', { serverSelectionTimeoutMS: 3000 });
    connected = true;

    company = await Company.create({ name: 'LA Co', slug: `la-${Date.now()}`, email: `la-${Date.now()}@t.dev`, settings: { timezone: 'Asia/Kolkata', fiscalYearStart: 1, leave: { weekendDays: ['SAT', 'SUN'] } } });
    emp = await Employee.create({ company_id: company._id, firstName: 'LA', lastName: 'Emp', gender: 'male', status: 'active' });
    AL  = await LeaveType.create({ company_id: company._id, name: 'Annual', code: 'AL', type: 'paid', daysPerYear: 12, resetCycle: 'calendar_year', allowHalfDay: true, maxDaysAtOnce: 10 });
    await LeaveBalance.create({ company_id: company._id, employee_id: emp._id, leaveType_id: AL._id, year: YEAR, allocated: 12 });

    // Clock-in on 2 Feb 2026 at 09:00 IST (= 03:30 UTC)
    await AttendanceRecord.create({
      company_id: company._id, employee_id: emp._id,
      date: new Date(Date.UTC(2026, 1, 1, 18, 30)), // local midnight IST for 2 Feb
      clockInTime: new Date(Date.UTC(2026, 1, 2, 3, 30)),
      clockInType: 'office', status: 'present',
    });
  } catch (e) {
    console.warn('[leaveAttendance.test] MongoDB unavailable — skipping:', e.message);
  }
});

test.after(async () => {
  if (connected) {
    await Promise.all([
      Company.deleteMany({ _id: company._id }),
      Employee.deleteMany({ company_id: company._id }),
      LeaveType.deleteMany({ company_id: company._id }),
      LeaveBalance.deleteMany({ company_id: company._id }),
      LeaveRequest.deleteMany({ company_id: company._id }),
      AttendanceRecord.deleteMany({ company_id: company._id }),
    ]);
    await mongoose.disconnect();
  }
});

// ── apply-leave side ──
test('full-day leave on a clocked-in day is blocked', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await clearLeaves();
  await assert.rejects(() => apply(AL._id, '2026-02-02', '2026-02-04'), /already clocked in/i);
});

test('half-day leave on a clocked-in day is ALLOWED (works other half)', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await clearLeaves();
  const r = await apply(AL._id, '2026-02-02', '2026-02-02', { isHalfDay: true, halfDaySession: 'afternoon' });
  assert.strictEqual(r.totalDays, 0.5);
});

test('full-day leave on a day with no clock-in is allowed', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await clearLeaves();
  const r = await apply(AL._id, '2026-02-05', '2026-02-06'); // Thu–Fri, no attendance
  assert.strictEqual(r.status, 'pending');
});

test('multi-day full-day leave blocked if ANY day was worked', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await clearLeaves();
  await assert.rejects(() => apply(AL._id, '2026-01-30', '2026-02-03'), /already clocked in/i); // spans 2 Feb
});

// ── clock-in side (helper the guard uses) ──
test('findApprovedLeaveOnDay: full-day approved leave detected', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await clearLeaves();
  await LeaveRequest.create({ company_id: company._id, employee_id: emp._id, leaveType_id: AL._id, startDate: parseCivil('2026-02-10'), endDate: parseCivil('2026-02-10'), totalDays: 1, status: 'approved' });
  const hit = await findApprovedLeaveOnDay(company._id, emp._id, parseCivil('2026-02-10'));
  assert.ok(hit, 'should find the leave');
  assert.strictEqual(hit.isHalfDay, false, 'full-day → clock-in must be blocked by caller');
});

test('findApprovedLeaveOnDay: half-day approved leave allows clock-in', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await clearLeaves();
  await LeaveRequest.create({ company_id: company._id, employee_id: emp._id, leaveType_id: AL._id, startDate: parseCivil('2026-02-11'), endDate: parseCivil('2026-02-11'), totalDays: 0.5, isHalfDay: true, halfDaySession: 'morning', status: 'approved' });
  const hit = await findApprovedLeaveOnDay(company._id, emp._id, parseCivil('2026-02-11'));
  assert.ok(hit);
  assert.strictEqual(hit.isHalfDay, true, 'half-day → caller allows clock-in');
});

test('findApprovedLeaveOnDay: no leave → null', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await clearLeaves();
  const hit = await findApprovedLeaveOnDay(company._id, emp._id, parseCivil('2026-02-12'));
  assert.strictEqual(hit, null);
});

test('findWorkedDayInRange resolves the clock-in day in IST', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  const hit = await findWorkedDayInRange(company._id, emp._id, parseCivil('2026-02-01'), parseCivil('2026-02-03'), 'Asia/Kolkata');
  assert.strictEqual(hit, '2026-02-02');
});
