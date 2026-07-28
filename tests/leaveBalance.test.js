/**
 * End-to-end balance-deduction tests for the leave lifecycle
 * (apply → approve/reject/cancel, LWP, comp-off, holiday-block, guards).
 * Runs the real services against a local MongoDB under IST. Self-skips if no DB.
 */
const test     = require('node:test');
const assert   = require('node:assert');
const mongoose = require('mongoose');

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'a'.repeat(64);

const Company      = require('../src/models/Company');
const Employee     = require('../src/models/Employee');
const LeaveType    = require('../src/models/LeaveType');
const LeaveBalance = require('../src/models/LeaveBalance');
const LeaveRequest = require('../src/models/LeaveRequest');
const PublicHoliday = require('../src/models/PublicHoliday');
const svc          = require('../src/services/leave/leaveRequest.service');

const YEAR = 2026;
const reviewer = new mongoose.Types.ObjectId();
const noon = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 12)); };

let connected = false;
let company, emp, AL, CO, ML;

const resetAL = async (over = {}) => {
  await LeaveRequest.deleteMany({ employee_id: emp._id });
  await LeaveBalance.updateOne(
    { company_id: company._id, employee_id: emp._id, leaveType_id: AL._id, year: YEAR },
    { $set: { allocated: 12, carryForward: 0, used: 0, pending: 0, adjustment: 0, ...over } },
  );
};
const balAL = async () => {
  const b = await LeaveBalance.findOne({ company_id: company._id, employee_id: emp._id, leaveType_id: AL._id, year: YEAR }).lean();
  b.remaining = b.allocated + b.carryForward + b.adjustment - b.used - b.pending; // virtual not applied under plain lean
  return b;
};
const apply = (typeId, startDate, endDate, extra = {}) =>
  svc.applyLeave(company._id, emp._id, { leaveType_id: typeId, startDate, endDate, ...extra });

test.before(async () => {
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/hrms_leavebal_test', { serverSelectionTimeoutMS: 3000 });
    connected = true;

    company = await Company.create({
      name: 'LeaveBal Co', slug: `lb-${Date.now()}`, email: `lb-${Date.now()}@t.dev`,
      settings: { timezone: 'Asia/Kolkata', fiscalYearStart: 1, leave: { weekendDays: ['SAT', 'SUN'] } },
    });
    emp = await Employee.create({ company_id: company._id, firstName: 'Bal', lastName: 'Emp', gender: 'male', status: 'active' });

    AL = await LeaveType.create({ company_id: company._id, name: 'Annual', code: 'AL', type: 'paid', daysPerYear: 12, resetCycle: 'calendar_year', allowHalfDay: true, maxDaysAtOnce: 5, minDaysNotice: 0 });
    CO = await LeaveType.create({ company_id: company._id, name: 'Comp Off', code: 'CO', type: 'comp_off', daysPerYear: 0, resetCycle: 'calendar_year', maxDaysAtOnce: 10 });
    ML = await LeaveType.create({ company_id: company._id, name: 'Maternity', code: 'ML', type: 'paid', daysPerYear: 90, resetCycle: 'calendar_year', applicableGender: 'female', maxDaysAtOnce: 90 });

    await PublicHoliday.create({ company_id: company._id, name: 'Republic Day', date: noon('2026-01-26'), year: YEAR, isActive: true, isOptional: false, location_id: null });

    await LeaveBalance.create([
      { company_id: company._id, employee_id: emp._id, leaveType_id: AL._id, year: YEAR, allocated: 12 },
      { company_id: company._id, employee_id: emp._id, leaveType_id: CO._id, year: YEAR, allocated: 2 },
    ]);
  } catch (e) {
    console.warn('[leaveBalance.test] MongoDB unavailable — skipping:', e.message);
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
      PublicHoliday.deleteMany({ company_id: company._id }),
    ]);
    await mongoose.disconnect();
  }
});

test('apply reserves pending; remaining drops', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await resetAL();
  const req = await apply(AL._id, '2026-02-02', '2026-02-04'); // Mon–Wed = 3
  assert.strictEqual(req.totalDays, 3);
  assert.strictEqual(req.isLWP, false);
  const b = await balAL();
  assert.strictEqual(b.pending, 3);
  assert.strictEqual(b.used, 0);
  assert.strictEqual(b.remaining, 9);
});

test('approve moves pending → used', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await resetAL();
  const req = await apply(AL._id, '2026-02-02', '2026-02-04');
  await svc.approveLeave(company._id, req._id, reviewer, 'ok');
  const b = await balAL();
  assert.strictEqual(b.pending, 0);
  assert.strictEqual(b.used, 3);
  assert.strictEqual(b.remaining, 9);
});

test('reject restores pending', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await resetAL();
  const req = await apply(AL._id, '2026-02-02', '2026-02-04');
  await svc.rejectLeave(company._id, req._id, reviewer, 'no');
  const b = await balAL();
  assert.strictEqual(b.pending, 0);
  assert.strictEqual(b.used, 0);
  assert.strictEqual(b.remaining, 12);
});

test('cancel while pending restores pending', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await resetAL();
  const req = await apply(AL._id, '2026-02-02', '2026-02-04');
  await svc.cancelLeave(company._id, emp._id, req._id);
  const b = await balAL();
  assert.strictEqual(b.pending, 0);
  assert.strictEqual(b.remaining, 12);
});

test('cancel after approve restores used', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await resetAL();
  const req = await apply(AL._id, '2026-02-02', '2026-02-04');
  await svc.approveLeave(company._id, req._id, reviewer, 'ok');
  await svc.cancelLeave(company._id, emp._id, req._id);
  const b = await balAL();
  assert.strictEqual(b.used, 0);
  assert.strictEqual(b.remaining, 12);
});

test('half-day deducts 0.5', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await resetAL();
  const req = await apply(AL._id, '2026-02-09', '2026-02-09', { isHalfDay: true, halfDaySession: 'morning' });
  assert.strictEqual(req.totalDays, 0.5);
  const b = await balAL();
  assert.strictEqual(b.pending, 0.5);
  assert.strictEqual(b.remaining, 11.5);
});

test('insufficient balance → auto-LWP, balance untouched', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await resetAL({ allocated: 1 });                 // remaining 1
  const req = await apply(AL._id, '2026-02-02', '2026-02-04'); // needs 3
  assert.strictEqual(req.isLWP, true);
  const b = await balAL();
  assert.strictEqual(b.pending, 0, 'LWP must not reserve balance');
  assert.strictEqual(b.remaining, 1);
});

test('comp-off: deducts when available, throws when short', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await LeaveRequest.deleteMany({ employee_id: emp._id });
  await LeaveBalance.updateOne({ company_id: company._id, employee_id: emp._id, leaveType_id: CO._id, year: YEAR }, { $set: { used: 0, pending: 0, allocated: 2 } });
  const req = await apply(CO._id, '2026-02-02', '2026-02-02'); // 1 day
  assert.strictEqual(req.totalDays, 1);
  await assert.rejects(() => apply(CO._id, '2026-02-10', '2026-02-13'), /Insufficient comp-off/i);
});

test('leave ON a public holiday is blocked (creation) — IST-safe', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await resetAL();
  await assert.rejects(() => apply(AL._id, '2026-01-26', '2026-01-26'), /No working days/i);
  const b = await balAL();
  assert.strictEqual(b.pending, 0, 'no balance touched when creation is blocked');
});

test('maxDaysAtOnce enforced', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await resetAL();
  // Feb 2–10 excl. weekend = 7 working days > maxDaysAtOnce(5)
  await assert.rejects(() => apply(AL._id, '2026-02-02', '2026-02-10'), /Maximum 5/i);
});

test('overlapping request is rejected', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await resetAL();
  await apply(AL._id, '2026-02-02', '2026-02-04');
  await assert.rejects(() => apply(AL._id, '2026-02-03', '2026-02-05'), /overlapping/i);
});

test('gender-restricted leave blocked for wrong gender', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await LeaveRequest.deleteMany({ employee_id: emp._id });
  await assert.rejects(() => apply(ML._id, '2026-02-02', '2026-02-04'), /female/i);
});
