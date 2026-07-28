/**
 * Extensive payroll-engine tests for calculatePayrollRecord + payrollHelpers.
 * Real DB (local Mongo), IST. Self-skips if no DB.
 *
 * Fixture (March 2026 = 22 working days Mon–Fri, no holidays):
 *   earnings  Basic 15000 + HRA 7000 = gross 22000
 *   deductions PF 1800 + Tax 1000   = 2800
 *   → perDaySalary = 22000/22 = 1000 ; standardHours 8 → perHour = 125
 */
const test     = require('node:test');
const assert   = require('node:assert');
const mongoose = require('mongoose');

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'a'.repeat(64);

// Stub reimbursements before the payroll service lazily requires it
const reimb = { ret: [] };
const reimbPath = require.resolve('../src/services/reimbursement/reimbursement.service');
require.cache[reimbPath] = { id: reimbPath, filename: reimbPath, loaded: true, exports: { getApprovedForPayroll: async () => reimb.ret } };

const Company          = require('../src/models/Company');
const Employee         = require('../src/models/Employee');
const WorkPolicy       = require('../src/models/WorkPolicy');
const EmployeeSalary   = require('../src/models/EmployeeSalary');
const PublicHoliday    = require('../src/models/PublicHoliday');
const LeaveRequest     = require('../src/models/LeaveRequest');
const AttendanceRecord = require('../src/models/AttendanceRecord');
const { calculatePayrollRecord } = require('../src/services/payroll/calculatePayroll.service');
const { isMidMonthJoiner, isMidMonthExit, getWorkingDaysInMonth } = require('../src/utils/payrollHelpers');

const oid = () => new mongoose.Types.ObjectId();
const noon = (y, m, d) => new Date(Date.UTC(y, m - 1, d, 12)); // m is 1-indexed
const MONTH = 3, YEAR = 2026;

let connected = false;
let company, LOC, policy, emp;

const BASE_POLICY = {
  workingDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'], workStart: '09:00', workEnd: '17:00',
  overtimeEnabled: false, lateDeductionEnabled: false, lateDeductionType: 'none',
  lateDeductionAmount: 0, lateDeductionAfterCount: 0, ignoreLatIfHoursCompleted: false,
  overtimeCompensationType: 'pay', overtimeRateMultiplier: 1, overtimeMinHours: 1, isDefault: true,
};

const setPolicy = (over = {}) => WorkPolicy.updateOne({ _id: policy._id }, { $set: { ...BASE_POLICY, ...over } });

const baseSalary = (over = {}) => EmployeeSalary.create({
  company_id: company._id, employee_id: emp._id, type: 'custom', effectiveDate: noon(2020, 1, 1),
  status: 'active', ctcMonthly: 22000,
  components: [
    { component_id: oid(), name: 'Basic', type: 'earning',   calcType: 'fixed', value: 15000, monthlyAmount: 15000 },
    { component_id: oid(), name: 'HRA',   type: 'earning',   calcType: 'fixed', value: 7000,  monthlyAmount: 7000 },
    { component_id: oid(), name: 'PF',    type: 'deduction', calcType: 'fixed', value: 1800,  monthlyAmount: 1800 },
    { component_id: oid(), name: 'Tax',   type: 'deduction', calcType: 'fixed', value: 1000,  monthlyAmount: 1000 },
  ],
  ...over,
});

const att = (day, over = {}) => AttendanceRecord.create({
  company_id: company._id, employee_id: emp._id, date: noon(YEAR, MONTH, day),
  status: 'present', ...over,
});
const leave = (startD, endD, over = {}) => LeaveRequest.create({
  company_id: company._id, employee_id: emp._id, leaveType_id: oid(),
  startDate: noon(YEAR, MONTH, startD), endDate: noon(YEAR, MONTH, endD),
  totalDays: 1, status: 'approved', ...over,
});
const holiday = (day) => PublicHoliday.create({
  company_id: company._id, name: 'Hol', date: noon(YEAR, MONTH, day), year: YEAR, isActive: true, isOptional: false, location_id: null,
});

const reset = async () => {
  reimb.ret = [];
  await Promise.all([
    EmployeeSalary.deleteMany({ company_id: company._id }),
    AttendanceRecord.deleteMany({ company_id: company._id }),
    LeaveRequest.deleteMany({ company_id: company._id }),
    PublicHoliday.deleteMany({ company_id: company._id }),
  ]);
  await setPolicy();
  emp.joiningDate = noon(2020, 1, 1);
};

const calc = () => calculatePayrollRecord(emp, MONTH, YEAR, company._id);

test.before(async () => {
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/hrms_payroll_test', { serverSelectionTimeoutMS: 3000 });
    connected = true;
    company = await Company.create({ name: 'PR Co', slug: `pr-${Date.now()}`, email: `pr-${Date.now()}@t.dev`, settings: { timezone: 'Asia/Kolkata' } });
    LOC = oid();
    policy = await WorkPolicy.create({ company_id: company._id, location_id: LOC, name: 'Default', ...BASE_POLICY });
    emp = { _id: oid(), company_id: company._id, joiningDate: noon(2020, 1, 1), workPolicy_id: policy._id, location_id: LOC };
  } catch (e) {
    console.warn('[payroll.test] MongoDB unavailable — skipping:', e.message);
  }
});

test.after(async () => {
  if (connected) {
    await Promise.all([
      Company.deleteMany({ _id: company._id }),
      WorkPolicy.deleteMany({ company_id: company._id }),
      EmployeeSalary.deleteMany({ company_id: company._id }),
      AttendanceRecord.deleteMany({ company_id: company._id }),
      LeaveRequest.deleteMany({ company_id: company._id }),
      PublicHoliday.deleteMany({ company_id: company._id }),
    ]);
    await mongoose.disconnect();
  }
});

// ── pure helpers ──
test('isMidMonthJoiner / isMidMonthExit', (t) => {
  assert.strictEqual(isMidMonthJoiner(noon(2026, 3, 16), 3, 2026), true);
  assert.strictEqual(isMidMonthJoiner(noon(2026, 3, 1), 3, 2026), false);
  assert.strictEqual(isMidMonthJoiner(noon(2026, 2, 16), 3, 2026), false);
  assert.strictEqual(isMidMonthExit(noon(2026, 3, 20), 3, 2026), true);
  assert.strictEqual(isMidMonthExit(noon(2026, 3, 31), 3, 2026), false);
});

test('getWorkingDaysInMonth: March 2026 Mon–Fri = 22; minus a weekday holiday = 21', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await reset();
  let r = await getWorkingDaysInMonth(3, 2026, BASE_POLICY.workingDays, LOC, company._id);
  assert.strictEqual(r.totalWorkingDays, 22);
  await holiday(3); // Tue 3 Mar
  r = await getWorkingDaysInMonth(3, 2026, BASE_POLICY.workingDays, LOC, company._id);
  assert.strictEqual(r.totalWorkingDays, 21);
});

// ── engine: base / guards ──
test('full month, no absences → full gross, only component deductions', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await reset(); await baseSalary();
  const r = await calc();
  assert.strictEqual(r.totalWorkingDays, 22);
  assert.strictEqual(r.perDaySalary, 1000);
  assert.strictEqual(r.perHourSalary, 125);
  assert.strictEqual(r.grossEarnings, 22000);
  assert.strictEqual(r.totalDeductions, 2800);
  assert.strictEqual(r.netPay, 19200);
});

test('no salary → warning record, net 0', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await reset();
  const r = await calc();
  assert.strictEqual(r.status, 'warning');
  assert.strictEqual(r.netPay, 0);
  assert.match(r.warnings.join(' '), /No salary/i);
});

test('joined after payroll month → null (skipped)', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await reset(); await baseSalary();
  emp.joiningDate = noon(2026, 4, 5);
  const r = await calc();
  assert.strictEqual(r, null);
  emp.joiningDate = noon(2020, 1, 1);
});

test('mid-month joiner (16 Mar) → pro-rated gross + pro-rated component deductions', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await reset(); await baseSalary();
  emp.joiningDate = noon(2026, 3, 16);
  const r = await calc();
  assert.strictEqual(r.effectiveWorkingDays, 12);
  assert.strictEqual(r.grossEarnings, 12000);          // 1000 * 12
  assert.strictEqual(r.totalDeductions, 1527.27);      // 2800 * 12/22
  assert.strictEqual(r.netPay, 10472.73);
  emp.joiningDate = noon(2020, 1, 1);
});

// ── LWP / absent / half-day ──
test('2 full LWP days → 2000 deducted', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await reset(); await baseSalary();
  await leave(3, 4, { isLWP: true, totalDays: 2 }); // Tue–Wed
  const r = await calc();
  assert.strictEqual(r.lwpDays, 2);
  assert.strictEqual(r.lwpDeductionAmount, 2000);
  assert.strictEqual(r.netPay, 17200);
});

test('half-day LWP → 0.5 day deducted (500)', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await reset(); await baseSalary();
  await leave(3, 3, { isLWP: true, isHalfDay: true, totalDays: 0.5 });
  const r = await calc();
  assert.strictEqual(r.lwpDays, 0.5);
  assert.strictEqual(r.lwpDeductionAmount, 500);
  assert.strictEqual(r.netPay, 18700);
});

test('1 absent day → 1000 deducted', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await reset(); await baseSalary();
  await att(3, { status: 'absent' });
  const r = await calc();
  assert.strictEqual(r.daysAbsent, 1);
  assert.strictEqual(r.absentDeductionAmount, 1000);
  assert.strictEqual(r.netPay, 18200);
});

test('absent + LWP same day → counted as LWP only (no double deduction)', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await reset(); await baseSalary();
  await att(3, { status: 'absent' });
  await leave(3, 3, { isLWP: true });
  const r = await calc();
  assert.strictEqual(r.daysAbsent, 0, 'absent deduped into LWP');
  assert.strictEqual(r.lwpDays, 1);
  assert.strictEqual(r.netPay, 18200);
});

test('half-day attendance (no leave) → 500 deducted', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await reset(); await baseSalary();
  await att(3, { status: 'half_day', totalHours: 3 });
  const r = await calc();
  assert.strictEqual(r.halfDays, 1);
  assert.strictEqual(r.halfDayDeductionAmount, 500);
  assert.strictEqual(r.netPay, 18700);
});

test('half-day attendance + paid half-day leave → full day, no half-day deduction', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await reset(); await baseSalary();
  await att(3, { status: 'half_day', totalHours: 4 });
  await leave(3, 3, { isLWP: false, isHalfDay: true, totalDays: 0.5 });
  const r = await calc();
  assert.strictEqual(r.halfDays, 0);
  assert.strictEqual(r.halfDayDeductionAmount, 0);
  assert.strictEqual(r.netPay, 19200);
});

// ── late deductions ──
test('late per_occurrence (3 late × 100)', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await reset(); await baseSalary();
  await setPolicy({ lateDeductionEnabled: true, lateDeductionType: 'per_occurrence', lateDeductionAmount: 100 });
  await att(3, { isLate: true, totalHours: 8 }); await att(4, { isLate: true, totalHours: 8 }); await att(5, { isLate: true, totalHours: 8 });
  const r = await calc();
  assert.strictEqual(r.deductibleLateCount, 3);
  assert.strictEqual(r.lateDeductionAmount, 300);
  assert.strictEqual(r.netPay, 18900);
});

test('late free passes (3 late, 2 free → 1 × 100)', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await reset(); await baseSalary();
  await setPolicy({ lateDeductionEnabled: true, lateDeductionType: 'per_occurrence', lateDeductionAmount: 100, lateDeductionAfterCount: 2 });
  await att(3, { isLate: true, totalHours: 8 }); await att(4, { isLate: true, totalHours: 8 }); await att(5, { isLate: true, totalHours: 8 });
  const r = await calc();
  assert.strictEqual(r.deductibleLateCount, 1);
  assert.strictEqual(r.lateDeductionAmount, 100);
});

test('late ignored when full hours completed', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await reset(); await baseSalary();
  await setPolicy({ lateDeductionEnabled: true, lateDeductionType: 'per_occurrence', lateDeductionAmount: 100, ignoreLatIfHoursCompleted: true });
  await att(3, { isLate: true, totalHours: 8 }); await att(4, { isLate: true, totalHours: 9 });
  const r = await calc();
  assert.strictEqual(r.deductibleLateCount, 0);
  assert.strictEqual(r.lateDeductionAmount, 0);
});

test('late salary_based (2 late × perDay × 0.5)', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await reset(); await baseSalary();
  await setPolicy({ lateDeductionEnabled: true, lateDeductionType: 'salary_based' });
  await att(3, { isLate: true, totalHours: 5 }); await att(4, { isLate: true, totalHours: 5 });
  const r = await calc();
  assert.strictEqual(r.lateDeductionAmount, 1000); // 2 * 1000 * 0.5
  assert.strictEqual(r.netPay, 18200);
});

// ── overtime ──
test('overtime pay (4h × perHour × 1.5)', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await reset(); await baseSalary();
  await setPolicy({ overtimeEnabled: true, overtimeCompensationType: 'pay', overtimeRateMultiplier: 1.5, overtimeMinHours: 1 });
  await att(3, { overtimeHours: 2 }); await att(4, { overtimeHours: 2 });
  const r = await calc();
  assert.strictEqual(r.overtimeHours, 4);
  assert.strictEqual(r.overtimeAmount, 750);  // 125 * 4 * 1.5
  assert.strictEqual(r.netPay, 19950);         // 22000 - 2800 + 750
});

test('overtime below min hours → no overtime', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await reset(); await baseSalary();
  await setPolicy({ overtimeEnabled: true, overtimeMinHours: 5 });
  await att(3, { overtimeHours: 4 });
  const r = await calc();
  assert.strictEqual(r.overtimeAmount, 0);
});

test('overtime comp_off → hours banked, no pay', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await reset(); await baseSalary();
  await setPolicy({ overtimeEnabled: true, overtimeCompensationType: 'comp_off' });
  await att(3, { overtimeHours: 3 });
  const r = await calc();
  assert.strictEqual(r.overtimeAmount, 0);
  assert.strictEqual(r.compOffHoursEarned, 3);
});

test('overtime both → pay AND comp-off', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await reset(); await baseSalary();
  await setPolicy({ overtimeEnabled: true, overtimeCompensationType: 'both', overtimeRateMultiplier: 2 });
  await att(3, { overtimeHours: 2 });
  const r = await calc();
  assert.strictEqual(r.overtimeAmount, 500); // 125 * 2 * 2
  assert.strictEqual(r.compOffHoursEarned, 2);
});

// ── reimbursements / net cap / weekend config ──
test('approved reimbursements add to net (non-taxable)', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await reset(); await baseSalary();
  reimb.ret = [{ _id: oid(), description: 'Travel', amount: 500 }];
  const r = await calc();
  assert.strictEqual(r.reimbursementTotal, 500);
  assert.strictEqual(r.netPay, 19700); // 19200 + 500
});

test('negative net pay is capped at 0 with warning', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await reset(); await baseSalary();
  await leave(2, 31, { isLWP: true, totalDays: 22 }); // whole month LWP
  const r = await calc();
  assert.strictEqual(r.netPay, 0);
  assert.match(r.warnings.join(' '), /negative/i);
});

test('6-day work week (Mon–Sat) → 26 working days, perDay changes', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await reset(); await baseSalary();
  await setPolicy({ workingDays: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] });
  const r = await calc();
  assert.strictEqual(r.totalWorkingDays, 26);
  assert.strictEqual(r.perDaySalary, Math.round((22000 / 26) * 100) / 100); // 846.15
});
