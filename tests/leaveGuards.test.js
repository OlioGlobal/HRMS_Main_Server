/**
 * Adversarial guard tests — "assume the user does dumb things".
 * Re-applying the same leave in every state + every leave-type config guard +
 * lifecycle guards. Real services, local MongoDB, run under IST. Self-skips if no DB.
 */
const test     = require('node:test');
const assert   = require('node:assert');
const mongoose = require('mongoose');

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'a'.repeat(64);

const Company       = require('../src/models/Company');
const Employee      = require('../src/models/Employee');
const LeaveType     = require('../src/models/LeaveType');
const LeaveBalance  = require('../src/models/LeaveBalance');
const LeaveRequest  = require('../src/models/LeaveRequest');
const PublicHoliday = require('../src/models/PublicHoliday');
const svc           = require('../src/services/leave/leaveRequest.service');
const { addDays, todayCivil, dayOfWeek } = require('../src/utils/civilDate');

const YEAR = 2026;
const reviewer = new mongoose.Types.ObjectId();
const noon = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 12)); };
const ymd  = (civil) => civil.toISOString().slice(0, 10);
const futureWeekday = (n) => { let d = addDays(todayCivil(), n); while (['SAT', 'SUN'].includes(dayOfWeek(d))) d = addDays(d, 1); return ymd(d); };

let connected = false;
let company, company2, emp, empProb, empNotice;
const T = {}; // leave types by code

const apply = (empId, typeId, startDate, endDate, extra = {}) =>
  svc.applyLeave(company._id, empId, { leaveType_id: typeId, startDate, endDate, ...extra });

const reset = async () => {
  await LeaveRequest.deleteMany({ company_id: company._id });
  await LeaveBalance.updateMany(
    { company_id: company._id, employee_id: emp._id },
    { $set: { used: 0, pending: 0, carryForward: 0, adjustment: 0, allocated: 20 } },
  );
};

test.before(async () => {
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/hrms_leaveguard_test', { serverSelectionTimeoutMS: 3000 });
    connected = true;

    company  = await Company.create({ name: 'Guard Co', slug: `g-${Date.now()}`, email: `g-${Date.now()}@t.dev`, settings: { timezone: 'Asia/Kolkata', fiscalYearStart: 1, leave: { weekendDays: ['SAT', 'SUN'] } } });
    company2 = await Company.create({ name: 'Other Co', slug: `o-${Date.now()}`, email: `o-${Date.now()}@t.dev` });

    emp      = await Employee.create({ company_id: company._id, firstName: 'Guard', lastName: 'Emp', gender: 'male', status: 'active' });
    empProb  = await Employee.create({ company_id: company._id, firstName: 'Prob', lastName: 'Emp', gender: 'male', status: 'active', probationEndDate: addDays(todayCivil(), 60) });
    empNotice = await Employee.create({ company_id: company._id, firstName: 'Notice', lastName: 'Emp', gender: 'male', status: 'notice' });

    const mk = (o) => LeaveType.create({ company_id: company._id, daysPerYear: 20, resetCycle: 'calendar_year', ...o });
    T.AL   = await mk({ name: 'Annual',    code: 'AL',   allowHalfDay: true,  maxDaysAtOnce: 5, minDaysNotice: 0 });
    T.NHD  = await mk({ name: 'No Half',   code: 'NHD',  allowHalfDay: false });
    T.NOT7 = await mk({ name: 'Notice7',   code: 'NOT7', minDaysNotice: 7 });
    T.PROB = await mk({ name: 'ProbR',     code: 'PROB', restrictDuringProbation: true });
    T.NOTR = await mk({ name: 'NoticeR',   code: 'NOTR', restrictDuringNotice: true });
    T.ML   = await mk({ name: 'Maternity', code: 'ML',   applicableGender: 'female', maxDaysAtOnce: 90 });
    T.CW   = await mk({ name: 'CountWknd', code: 'CW',   countWeekends: true });
    T.CH   = await mk({ name: 'CountHol',  code: 'CH',   countHolidays: true });
    T.OFF  = await mk({ name: 'Inactive',  code: 'OFF',  isActive: false });
    const t2 = await LeaveType.create({ company_id: company2._id, name: 'Other', code: 'OT', daysPerYear: 20, resetCycle: 'calendar_year' });
    T.OTHER = t2;

    await PublicHoliday.create({ company_id: company._id, name: 'Republic Day', date: noon('2026-01-26'), year: YEAR, isActive: true, isOptional: false, location_id: null });

    await LeaveBalance.create([
      { company_id: company._id, employee_id: emp._id, leaveType_id: T.AL._id, year: YEAR, allocated: 20 },
      { company_id: company._id, employee_id: emp._id, leaveType_id: T.CW._id, year: YEAR, allocated: 20 },
      { company_id: company._id, employee_id: emp._id, leaveType_id: T.CH._id, year: YEAR, allocated: 20 },
    ]);
  } catch (e) {
    console.warn('[leaveGuards.test] MongoDB unavailable — skipping:', e.message);
  }
});

test.after(async () => {
  if (connected) {
    await Promise.all([
      Company.deleteMany({ _id: { $in: [company._id, company2._id] } }),
      Employee.deleteMany({ company_id: company._id }),
      LeaveType.deleteMany({ $or: [{ company_id: company._id }, { company_id: company2._id }] }),
      LeaveBalance.deleteMany({ company_id: company._id }),
      LeaveRequest.deleteMany({ company_id: company._id }),
      PublicHoliday.deleteMany({ company_id: company._id }),
    ]);
    await mongoose.disconnect();
  }
});

// ── Re-applying the same leave (the "dumb user double-books") ─────────────────
test('re-apply identical dates while PENDING → overlap blocked', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await reset();
  await apply(emp._id, T.AL._id, '2026-02-02', '2026-02-04');
  await assert.rejects(() => apply(emp._id, T.AL._id, '2026-02-02', '2026-02-04'), /overlapping/i);
});

test('re-apply identical dates after APPROVED → overlap blocked', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await reset();
  const r = await apply(emp._id, T.AL._id, '2026-02-02', '2026-02-04');
  await svc.approveLeave(company._id, r._id, reviewer);
  await assert.rejects(() => apply(emp._id, T.AL._id, '2026-02-02', '2026-02-04'), /overlapping/i);
});

test('re-apply after CANCEL → allowed, balance re-reserved', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await reset();
  const r = await apply(emp._id, T.AL._id, '2026-02-02', '2026-02-04');
  await svc.cancelLeave(company._id, emp._id, r._id);
  const r2 = await apply(emp._id, T.AL._id, '2026-02-02', '2026-02-04');
  assert.strictEqual(r2.totalDays, 3);
  const b = await LeaveBalance.findOne({ leaveType_id: T.AL._id, employee_id: emp._id }).lean();
  assert.strictEqual(b.pending, 3);
});

test('re-apply after REJECT → allowed', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await reset();
  const r = await apply(emp._id, T.AL._id, '2026-02-02', '2026-02-04');
  await svc.rejectLeave(company._id, r._id, reviewer);
  const r2 = await apply(emp._id, T.AL._id, '2026-02-02', '2026-02-04');
  assert.strictEqual(r2.status, 'pending');
});

test('partial overlap blocked', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await reset();
  await apply(emp._id, T.AL._id, '2026-02-02', '2026-02-04');
  await assert.rejects(() => apply(emp._id, T.AL._id, '2026-02-03', '2026-02-05'), /overlapping/i);
});

test('adjacent leaves sharing a boundary day blocked', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await reset();
  await apply(emp._id, T.AL._id, '2026-02-02', '2026-02-04');
  await assert.rejects(() => apply(emp._id, T.AL._id, '2026-02-04', '2026-02-06'), /overlapping/i);
});

// ── Date / half-day guards ───────────────────────────────────────────────────
test('end before start blocked', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await reset();
  await assert.rejects(() => apply(emp._id, T.AL._id, '2026-02-05', '2026-02-02'), /End date cannot be before/i);
});

test('half-day across two days blocked', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await reset();
  await assert.rejects(() => apply(emp._id, T.AL._id, '2026-02-02', '2026-02-03', { isHalfDay: true }), /single day/i);
});

test('half-day blocked when allowHalfDay=false', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await reset();
  await assert.rejects(() => apply(emp._id, T.NHD._id, '2026-02-02', '2026-02-02', { isHalfDay: true }), /Half-day is not allowed/i);
});

test('invalid date string blocked', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await reset();
  await assert.rejects(() => apply(emp._id, T.AL._id, 'not-a-date', 'nope'), /Invalid start or end date/i);
});

test('weekend-only range → no working days', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await reset();
  await assert.rejects(() => apply(emp._id, T.AL._id, '2026-01-10', '2026-01-11'), /No working days/i); // Sat–Sun
});

test('single day on holiday → no working days', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await reset();
  await assert.rejects(() => apply(emp._id, T.AL._id, '2026-01-26', '2026-01-26'), /No working days/i);
});

// ── Leave-type config guards ─────────────────────────────────────────────────
test('gender-restricted blocked for wrong gender', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await reset();
  await assert.rejects(() => apply(emp._id, T.ML._id, '2026-02-02', '2026-02-04'), /female/i);
});

test('probation-restricted blocked during probation', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await assert.rejects(() => apply(empProb._id, T.PROB._id, futureWeekday(10), futureWeekday(10)), /probation/i);
});

test('notice-restricted blocked during notice period', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await assert.rejects(() => apply(empNotice._id, T.NOTR._id, futureWeekday(10), futureWeekday(10)), /notice period/i);
});

test('minDaysNotice: too soon blocked', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await reset();
  const soon = ymd(addDays(todayCivil(), 1));
  await assert.rejects(() => apply(emp._id, T.NOT7._id, soon, soon), /advance notice/i);
});

test('minDaysNotice: sufficient notice allowed', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await reset();
  const far = futureWeekday(20);
  await assert.doesNotReject(() => apply(emp._id, T.NOT7._id, far, far));
});

test('inactive leave type blocked', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await reset();
  await assert.rejects(() => apply(emp._id, T.OFF._id, '2026-02-02', '2026-02-02'), /Leave type not found/i);
});

test('leave type from another company blocked', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await reset();
  await assert.rejects(() => apply(emp._id, T.OTHER._id, '2026-02-02', '2026-02-02'), /Leave type not found/i);
});

test('unknown employee blocked', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await assert.rejects(() => apply(new mongoose.Types.ObjectId(), T.AL._id, '2026-02-02', '2026-02-02'), /Employee not found/i);
});

test('maxDaysAtOnce: exactly at limit allowed, over limit blocked', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await reset();
  await assert.doesNotReject(() => apply(emp._id, T.AL._id, '2026-02-02', '2026-02-06')); // 5 working = limit
  await reset();
  await assert.rejects(() => apply(emp._id, T.AL._id, '2026-02-02', '2026-02-09'), /Maximum 5/i); // 6 working
});

// ── Config-driven creation (positive) ────────────────────────────────────────
test('countWeekends=true → weekend days count', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await reset();
  const r = await apply(emp._id, T.CW._id, '2026-01-10', '2026-01-11'); // Sat–Sun
  assert.strictEqual(r.totalDays, 2);
});

test('countHolidays=true → holiday counts', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await reset();
  const r = await apply(emp._id, T.CH._id, '2026-01-26', '2026-01-26'); // Republic Day
  assert.strictEqual(r.totalDays, 1);
});

// ── Lifecycle guards ─────────────────────────────────────────────────────────
test('cannot approve an already-approved request', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await reset();
  const r = await apply(emp._id, T.AL._id, '2026-02-02', '2026-02-04');
  await svc.approveLeave(company._id, r._id, reviewer);
  await assert.rejects(() => svc.approveLeave(company._id, r._id, reviewer), /Cannot approve/i);
});

test('cannot reject an already-approved request', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await reset();
  const r = await apply(emp._id, T.AL._id, '2026-02-02', '2026-02-04');
  await svc.approveLeave(company._id, r._id, reviewer);
  await assert.rejects(() => svc.rejectLeave(company._id, r._id, reviewer), /Cannot reject/i);
});

test('cannot cancel a rejected request', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await reset();
  const r = await apply(emp._id, T.AL._id, '2026-02-02', '2026-02-04');
  await svc.rejectLeave(company._id, r._id, reviewer);
  await assert.rejects(() => svc.cancelLeave(company._id, emp._id, r._id), /Cannot cancel a rejected/i);
});

test('cannot cancel twice', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await reset();
  const r = await apply(emp._id, T.AL._id, '2026-02-02', '2026-02-04');
  await svc.cancelLeave(company._id, emp._id, r._id);
  await assert.rejects(() => svc.cancelLeave(company._id, emp._id, r._id), /Already cancelled/i);
});

test('approve a non-existent request → 404', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await assert.rejects(() => svc.approveLeave(company._id, new mongoose.Types.ObjectId(), reviewer), /not found/i);
});
