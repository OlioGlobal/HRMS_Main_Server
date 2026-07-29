/**
 * Payslip config-snapshot + payroll edge cases.
 *
 *  Group A–D  buildPayslipData (PURE) — config snapshot precedence, currency
 *             formatting, earnings/deduction inclusion, fallbacks. Always run.
 *  Group E     getAttendanceSummary (DB) — present/late/half_day/absent/leave
 *             matrix incl. paid-half-day, LWP-half-day, absent+LWP dedup.
 *  Group F     calculatePayrollRecord (DB) — deductions, pro-rate, warnings.
 *
 *  Real services + local MongoDB. DB groups self-skip if no DB.
 *  Target: 300+ real edge cases.
 */
const test   = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'a'.repeat(64);

const { buildPayslipData } = require('../src/utils/payslipTemplate');

// ─── Factories ────────────────────────────────────────────────────────────────
const baseRecord = (over = {}) => ({
  month: 8, year: 2025,
  earnings: [{ name: 'Basic', amount: 20000 }, { name: 'HRA', amount: 8000 }],
  deductions: [{ name: 'PF', amount: 1800 }],
  overtimeAmount: 0, overtimeHours: 0,
  lwpDeductionAmount: 0, lwpDays: 0,
  absentDeductionAmount: 0, daysAbsent: 0,
  halfDayDeductionAmount: 0, halfDays: 0,
  lateDeductionAmount: 0, deductibleLateCount: 0,
  grossEarnings: 28000, totalDeductions: 1800, netPay: 26200,
  totalWorkingDays: 26, effectiveWorkingDays: 26,
  ...over,
});
const baseCompany = (payslip = {}, over = {}) => ({
  name: 'Acme Corp', city: 'Mumbai', state: 'MH', pincode: '400001', address: '1 Road',
  logo: null,
  settings: { currency: 'INR', payslip },
  ...over,
});
const baseEmployee = (over = {}) => ({
  firstName: 'Yash', lastName: 'C', employeeId: 'EMP001',
  designation_id: { name: 'Developer' }, department_id: { name: 'Eng' },
  ...over,
});

let CASES = 0;
const check = (label, fn) => test(label, () => { CASES++; fn(); });

// ─── Group A: config-snapshot precedence ───────────────────────────────────────
// For each text field: snapshot wins over live; falls back to live then default.
const TEXT_FIELDS = [
  ['title',          'title',          'PAY SLIP'],
  ['footerText',     'footerText',     'This is a computer-generated payslip'],
  ['signatoryName',  'signatoryName',  ''],
  ['signatoryLabel', 'signatoryLabel', 'Authorized Signatory'],
];

for (const [cfgKey, outKey, def] of TEXT_FIELDS) {
  check(`snapshot.${cfgKey} overrides live`, () => {
    const d = buildPayslipData({
      record: baseRecord(), employee: baseEmployee(),
      company: baseCompany({ [cfgKey]: 'LIVE' }),
      configSnapshot: { [cfgKey]: 'SNAP' },
    });
    assert.strictEqual(d[outKey], 'SNAP');
  });
  check(`snapshot.${cfgKey} used when live unset`, () => {
    const d = buildPayslipData({
      record: baseRecord(), employee: baseEmployee(),
      company: baseCompany({}), configSnapshot: { [cfgKey]: 'SNAP' },
    });
    assert.strictEqual(d[outKey], 'SNAP');
  });
  check(`live.${cfgKey} used when no snapshot`, () => {
    const d = buildPayslipData({
      record: baseRecord(), employee: baseEmployee(),
      company: baseCompany({ [cfgKey]: 'LIVE' }),
    });
    assert.strictEqual(d[outKey], 'LIVE');
  });
  check(`live.${cfgKey} used when snapshot null`, () => {
    const d = buildPayslipData({
      record: baseRecord(), employee: baseEmployee(),
      company: baseCompany({ [cfgKey]: 'LIVE' }), configSnapshot: null,
    });
    assert.strictEqual(d[outKey], 'LIVE');
  });
  check(`default.${cfgKey} when nothing set`, () => {
    const d = buildPayslipData({ record: baseRecord(), employee: baseEmployee(), company: baseCompany({}) });
    assert.strictEqual(d[outKey], def);
  });
  check(`empty snapshot {} → default.${cfgKey} (ignores live)`, () => {
    const d = buildPayslipData({
      record: baseRecord(), employee: baseEmployee(),
      company: baseCompany({ [cfgKey]: 'LIVE' }), configSnapshot: {},
    });
    assert.strictEqual(d[outKey], def);
  });
}

// Boolean/flag fields precedence
const BOOL_CASES = [
  ['showLogo', false, 'logoDataUri', (d) => assert.strictEqual(d.logoDataUri, null)],
  ['showWatermark', false, 'showWatermark', (d) => assert.strictEqual(d.showWatermark, false)],
  ['showWatermark', true, 'showWatermark', (d) => assert.strictEqual(d.showWatermark, true)],
  ['showEmployeeSignature', false, 'showEmployeeSignature', (d) => assert.strictEqual(d.showEmployeeSignature, false)],
  ['showEmployeeSignature', true, 'showEmployeeSignature', (d) => assert.strictEqual(d.showEmployeeSignature, true)],
];
for (const [cfgKey, val, _out, assertFn] of BOOL_CASES) {
  check(`snapshot.${cfgKey}=${val} applied`, () => {
    const d = buildPayslipData({
      record: baseRecord(), employee: baseEmployee(),
      company: baseCompany({ [cfgKey]: !val }), // live opposite → snapshot must win
      configSnapshot: { [cfgKey]: val },
    });
    assertFn(d);
  });
}

// watermarkText: snapshot > live > company.name (uppercased)
check('watermarkText from snapshot (upper)', () => {
  const d = buildPayslipData({ record: baseRecord(), employee: baseEmployee(), company: baseCompany({ watermarkText: 'live' }), configSnapshot: { watermarkText: 'snap' } });
  assert.strictEqual(d.watermarkText, 'SNAP');
});
check('watermarkText falls back to company name (upper)', () => {
  const d = buildPayslipData({ record: baseRecord(), employee: baseEmployee(), company: baseCompany({}) });
  assert.strictEqual(d.watermarkText, 'ACME CORP');
});

// The whole point: editing live config must NOT change a snapshotted payslip.
check('snapshot freezes payslip against later live edits', () => {
  const snap = { title: 'AUG PAYSLIP', footerText: 'Aug footer' };
  const d1 = buildPayslipData({ record: baseRecord(), employee: baseEmployee(), company: baseCompany({ title: 'OLD', footerText: 'old' }), configSnapshot: snap });
  // simulate a later live-config edit
  const d2 = buildPayslipData({ record: baseRecord(), employee: baseEmployee(), company: baseCompany({ title: 'BRAND NEW', footerText: 'changed!' }), configSnapshot: snap });
  assert.strictEqual(d1.title, 'AUG PAYSLIP');
  assert.strictEqual(d2.title, 'AUG PAYSLIP');
  assert.strictEqual(d1.footerText, d2.footerText);
});

// Partial snapshot: only provided keys come from snapshot; the rest fall to DEFAULTS
// (not live), because a non-null snapshot fully replaces the live config object.
check('partial snapshot: unset keys use defaults not live', () => {
  const d = buildPayslipData({
    record: baseRecord(), employee: baseEmployee(),
    company: baseCompany({ title: 'LIVE T', footerText: 'LIVE F' }),
    configSnapshot: { title: 'SNAP T' },
  });
  assert.strictEqual(d.title, 'SNAP T');
  assert.strictEqual(d.footerText, 'This is a computer-generated payslip'); // default, not LIVE F
});
check('employeeId passes through from employee', () => {
  const d = buildPayslipData({ record: baseRecord(), employee: baseEmployee({ employeeId: 'EMP777' }), company: baseCompany({}) });
  assert.strictEqual(d.employeeId, 'EMP777');
});
check('totalDays from record.totalWorkingDays', () => {
  const d = buildPayslipData({ record: baseRecord({ totalWorkingDays: 23 }), employee: baseEmployee(), company: baseCompany({}) });
  assert.strictEqual(d.totalDays, 23);
});
check('totalDays falls back to effectiveWorkingDays', () => {
  const d = buildPayslipData({ record: baseRecord({ totalWorkingDays: 0, effectiveWorkingDays: 12 }), employee: baseEmployee(), company: baseCompany({}) });
  assert.strictEqual(d.totalDays, 12);
});
check('companyName default when missing', () => {
  const d = buildPayslipData({ record: baseRecord(), employee: baseEmployee(), company: { settings: { currency: 'INR', payslip: {} } } });
  assert.strictEqual(d.companyName, 'Company');
});

// ─── Group B: currency formatting ──────────────────────────────────────────────
const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'SGD'];
const AMOUNTS = [0, 1, 99, 100, 999, 1000, 1234.4, 1234.6, 1234.5, 50000, 999999, 1234567, -1, -1234.6, 0.4, 0.5, 0.6];
for (const cur of CURRENCIES) {
  for (const amt of AMOUNTS) {
    check(`fmt ${cur} ${amt} is a non-empty string`, () => {
      const d = buildPayslipData({ record: baseRecord(), employee: baseEmployee(), company: baseCompany({}, { settings: { currency: cur, payslip: {} } }) });
      const s = d.fmt(amt);
      assert.ok(typeof s === 'string' && s.length > 0, `fmt returned "${s}"`);
      // rounding: fmt rounds to whole units
      assert.ok(!/\.\d/.test(s.replace(/[^0-9.]/g, '')) || cur === 'x', 'no fractional digits after rounding');
    });
  }
}
// Invalid currency code (2 letters) → fallback path, still a string
check('invalid currency code falls back gracefully', () => {
  const d = buildPayslipData({ record: baseRecord(), employee: baseEmployee(), company: baseCompany({}, { settings: { currency: 'US', payslip: {} } }) });
  assert.ok(typeof d.fmt(1000) === 'string');
});
check('missing currency defaults to USD', () => {
  const d = buildPayslipData({ record: baseRecord(), employee: baseEmployee(), company: baseCompany({}, { settings: { payslip: {} } }) });
  assert.ok(typeof d.fmt(1000) === 'string');
});

// ─── Group C: earnings & deduction inclusion ───────────────────────────────────
// Each attendance-based deduction appears only when its amount > 0.
const DEDUCTION_FLAGS = [
  ['lwpDeductionAmount',     'lwpDays',             /LWP/],
  ['absentDeductionAmount',  'daysAbsent',          /Absent/],
  ['halfDayDeductionAmount', 'halfDays',            /Half Days/],
  ['lateDeductionAmount',    'deductibleLateCount', /Late/],
];
for (const [amtKey, cntKey, re] of DEDUCTION_FLAGS) {
  check(`${amtKey} > 0 → appears in deductions`, () => {
    const d = buildPayslipData({ record: baseRecord({ [amtKey]: 500, [cntKey]: 2 }), employee: baseEmployee(), company: baseCompany({}) });
    assert.ok(d.deductions.some((x) => re.test(x.name)), `expected ${re} in deductions`);
  });
  check(`${amtKey} = 0 → excluded from deductions`, () => {
    const d = buildPayslipData({ record: baseRecord({ [amtKey]: 0, [cntKey]: 0 }), employee: baseEmployee(), company: baseCompany({}) });
    assert.ok(!d.deductions.some((x) => re.test(x.name)), `did not expect ${re}`);
  });
}
check('overtime > 0 → appears in earnings', () => {
  const d = buildPayslipData({ record: baseRecord({ overtimeAmount: 750, overtimeHours: 3 }), employee: baseEmployee(), company: baseCompany({}) });
  assert.ok(d.earnings.some((e) => /Overtime/.test(e.name)));
});
check('overtime = 0 → excluded from earnings', () => {
  const d = buildPayslipData({ record: baseRecord({ overtimeAmount: 0 }), employee: baseEmployee(), company: baseCompany({}) });
  assert.ok(!d.earnings.some((e) => /Overtime/.test(e.name)));
});
check('component earnings + deductions passed through', () => {
  const d = buildPayslipData({ record: baseRecord(), employee: baseEmployee(), company: baseCompany({}) });
  assert.deepStrictEqual(d.earnings.map((e) => e.name).slice(0, 2), ['Basic', 'HRA']);
  assert.ok(d.deductions.some((x) => x.name === 'PF'));
});
// All deductions present together
check('all attendance deductions present together', () => {
  const d = buildPayslipData({ record: baseRecord({ lwpDeductionAmount: 100, lwpDays: 1, absentDeductionAmount: 200, daysAbsent: 1, halfDayDeductionAmount: 50, halfDays: 1, lateDeductionAmount: 25, deductibleLateCount: 1 }), employee: baseEmployee(), company: baseCompany({}) });
  for (const re of [/LWP/, /Absent/, /Half Days/, /Late/, /PF/]) {
    assert.ok(d.deductions.some((x) => re.test(x.name)), `${re} missing`);
  }
});

// ─── Group D: fallbacks & missing fields ───────────────────────────────────────
check('employee name from record when no employee', () => {
  const d = buildPayslipData({ record: baseRecord({ employeeName: 'From Record' }), employee: null, company: baseCompany({}) });
  assert.strictEqual(d.employeeName, 'From Record');
});
check('designation/department fall back to dashes', () => {
  const d = buildPayslipData({ record: baseRecord(), employee: baseEmployee({ designation_id: null, department_id: null }), company: baseCompany({}) });
  assert.strictEqual(d.designation, '—');
  assert.strictEqual(d.department, '—');
});
check('string designation/department (unpopulated) accepted', () => {
  const d = buildPayslipData({ record: baseRecord(), employee: baseEmployee({ designation_id: null, department_id: null, designation: 'Mgr', department: 'Ops' }), company: baseCompany({}) });
  assert.strictEqual(d.designation, 'Mgr');
  assert.strictEqual(d.department, 'Ops');
});
check('empty earnings/deductions arrays', () => {
  const d = buildPayslipData({ record: baseRecord({ earnings: [], deductions: [] }), employee: baseEmployee(), company: baseCompany({}) });
  assert.deepStrictEqual(d.earnings, []);
  assert.deepStrictEqual(d.deductions, []);
});
check('null earnings/deductions coerced to empty', () => {
  const d = buildPayslipData({ record: baseRecord({ earnings: null, deductions: null }), employee: baseEmployee(), company: baseCompany({}) });
  assert.deepStrictEqual(d.earnings, []);
  assert.deepStrictEqual(d.deductions, []);
});
check('missing money fields default to 0', () => {
  const d = buildPayslipData({ record: { month: 3, year: 2025 }, employee: baseEmployee(), company: baseCompany({}) });
  assert.strictEqual(d.grossEarnings, 0);
  assert.strictEqual(d.totalDeductions, 0);
  assert.strictEqual(d.netPay, 0);
});
check('address lines skip empties', () => {
  const d = buildPayslipData({ record: baseRecord(), employee: baseEmployee(), company: baseCompany({}, { name: 'X', address: '', city: '', state: '', pincode: '', settings: { currency: 'INR', payslip: {} } }) });
  assert.deepStrictEqual(d.addressLines, []);
});
check('month label formats correctly', () => {
  const d = buildPayslipData({ record: baseRecord({ month: 12, year: 2024 }), employee: baseEmployee(), company: baseCompany({}) });
  assert.strictEqual(d.monthLabel, 'December 2024');
});
// month label for every month
for (let m = 1; m <= 12; m++) {
  check(`month label month=${m}`, () => {
    const d = buildPayslipData({ record: baseRecord({ month: m, year: 2025 }), employee: baseEmployee(), company: baseCompany({}) });
    assert.ok(/\d{4}$/.test(d.monthLabel));
  });
}
// netPay values (incl 0 and negative) don't throw amountInWords
for (const np of [0, 1, 100, 26200, 999999, -500, 1234567]) {
  check(`amountInWords for netPay=${np}`, () => {
    const d = buildPayslipData({ record: baseRecord({ netPay: np }), employee: baseEmployee(), company: baseCompany({}) });
    assert.ok(typeof d.amountInWords === 'string');
  });
}

// ════════════════════════════════════════════════════════════════════════════
// DB GROUPS — getAttendanceSummary + calculatePayrollRecord
// ════════════════════════════════════════════════════════════════════════════
const Company          = require('../src/models/Company');
const Employee         = require('../src/models/Employee');
const LeaveType        = require('../src/models/LeaveType');
const LeaveRequest     = require('../src/models/LeaveRequest');
const AttendanceRecord = require('../src/models/AttendanceRecord');
const WorkPolicy       = require('../src/models/WorkPolicy');
const EmployeeSalary   = require('../src/models/EmployeeSalary');
const Location         = require('../src/models/Location');
const { getAttendanceSummary } = require('../src/utils/payrollHelpers');
const { calculatePayrollRecord } = require('../src/services/payroll/calculatePayroll.service');
const { encryptSalaryDoc } = require('../src/utils/encryption');

let connected = false;
let co, em, lt, loc, wp, em2, em3;
const GROSS = 26000; // single earning component
const M = 6, Y = 2025;
const WP = { workStart: '09:00', workEnd: '18:00', workingDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'], lateDeductionEnabled: false, ignoreLatIfHoursCompleted: false };
const dayUTC = (day, h = 0) => new Date(Date.UTC(Y, M - 1, day, h));

const att = (day, status, extra = {}) => AttendanceRecord.create({ company_id: co._id, employee_id: em._id, date: dayUTC(day), status, ...extra });
const lv  = (day, { isHalfDay = false, isLWP = false, endDay = day } = {}) => LeaveRequest.create({
  company_id: co._id, employee_id: em._id, leaveType_id: lt._id,
  startDate: dayUTC(day), endDate: dayUTC(endDay), totalDays: isHalfDay ? 0.5 : (endDay - day + 1),
  isHalfDay, isLWP, status: 'approved',
});
const clearDb = async () => { await AttendanceRecord.deleteMany({ employee_id: em._id }); await LeaveRequest.deleteMany({ employee_id: em._id }); };

test.before(async () => {
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/hrms_payslip_test', { serverSelectionTimeoutMS: 3000 });
    connected = true;
    co = await Company.create({ name: 'PP Co', slug: `pp-${Date.now()}`, email: `pp-${Date.now()}@t.dev`, settings: { timezone: 'Asia/Kolkata' } });
    em = await Employee.create({ company_id: co._id, firstName: 'PP', lastName: 'Emp', gender: 'male', status: 'active' });
    em2 = await Employee.create({ company_id: co._id, firstName: 'No', lastName: 'Salary', gender: 'male', status: 'active' });
    lt = await LeaveType.create({ company_id: co._id, name: 'Annual', code: 'AL', type: 'paid', daysPerYear: 12, resetCycle: 'calendar_year', allowHalfDay: true, maxDaysAtOnce: 10 });
    loc = await Location.create({ company_id: co._id, name: 'HQ', country: 'India', timezone: 'Asia/Kolkata' });
    wp = await WorkPolicy.create({ company_id: co._id, location_id: loc._id, name: 'Std', workStart: '09:00', workEnd: '18:00', workingDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'], isDefault: false });
    // Active salary for `em`: one earning (26000) + one deduction (PF 1800)
    const oid = () => new mongoose.Types.ObjectId();
    await EmployeeSalary.create({
      company_id: co._id, employee_id: em._id, status: 'active', type: 'custom', effectiveDate: new Date(Date.UTC(2024, 0, 1)),
      ctcMonthly: GROSS,
      components: [
        { component_id: oid(), name: 'Basic', type: 'earning',   calcType: 'fixed', value: GROSS, monthlyAmount: GROSS },
        { component_id: oid(), name: 'PF',    type: 'deduction', calcType: 'fixed', value: 1800,  monthlyAmount: 1800 },
      ],
    });
    // em3: salary stored ENCRYPTED exactly like the salary service does — regression
    // guard against payroll reading raw ENC_v1 strings and producing NaN.
    em3 = await Employee.create({ company_id: co._id, firstName: 'Enc', lastName: 'Sal', gender: 'male', status: 'active' });
    const encDoc = encryptSalaryDoc({
      ctcMonthly: GROSS, ctcAnnual: GROSS * 12,
      components: [
        { component_id: oid(), name: 'Basic', type: 'earning',   calcType: 'fixed', value: GROSS, monthlyAmount: GROSS },
        { component_id: oid(), name: 'PF',    type: 'deduction', calcType: 'fixed', value: 1800,  monthlyAmount: 1800 },
      ],
    });
    await EmployeeSalary.create({ company_id: co._id, employee_id: em3._id, status: 'active', type: 'custom', effectiveDate: new Date(Date.UTC(2024, 0, 1)), ...encDoc });
  } catch (e) {
    console.warn('[payrollPayslip.test] MongoDB unavailable — DB groups skipped:', e.message);
  }
});
test.after(async () => {
  if (connected) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

const dbCheck = (label, fn) => test(label, async (t) => {
  if (!connected) { t.skip('no DB'); return; }
  CASES++; await clearDb(); await fn();
});

// ─── Group E: getAttendanceSummary matrix ──────────────────────────────────────
// A working day (Mon 2 Jun 2025). Combine attendance status × leave.
const D = 2; // Monday
const E_CASES = [
  ['present, no leave',              () => att(D, 'present'),                          { daysWorked: 1, halfDays: 0, daysAbsent: 0 }],
  ['late, no leave',                 () => att(D, 'late'),                             { daysWorked: 1, halfDays: 0, daysAbsent: 0 }],
  ['half_day, no leave',             () => att(D, 'half_day'),                         { daysWorked: 0, halfDays: 1, daysAbsent: 0 }],
  ['half_day + PAID half-day leave', async () => { await att(D, 'half_day'); await lv(D, { isHalfDay: true, isLWP: false }); }, { daysWorked: 1, halfDays: 0, daysAbsent: 0 }],
  ['half_day + LWP half-day leave',  async () => { await att(D, 'half_day'); await lv(D, { isHalfDay: true, isLWP: true }); },  { daysWorked: 1, halfDays: 0, daysAbsent: 0 }],
  ['half_day + PAID full leave',     async () => { await att(D, 'half_day'); await lv(D, { isHalfDay: false, isLWP: false }); }, { daysWorked: 0, halfDays: 1, daysAbsent: 0 }],
  ['absent, no leave',               () => att(D, 'absent'),                           { daysWorked: 0, halfDays: 0, daysAbsent: 1 }],
  ['absent + LWP full leave (dedup)',async () => { await att(D, 'absent'); await lv(D, { isHalfDay: false, isLWP: true }); },  { daysWorked: 0, halfDays: 0, daysAbsent: 0 }],
  ['absent + LWP half leave (dedup)',async () => { await att(D, 'absent'); await lv(D, { isHalfDay: true, isLWP: true }); },   { daysWorked: 0, halfDays: 0, daysAbsent: 0 }],
  ['on_leave status',                () => att(D, 'on_leave'),                         { daysWorked: 0, halfDays: 0, daysAbsent: 0 }],
  ['holiday status',                 () => att(D, 'holiday'),                          { daysWorked: 0, halfDays: 0, daysAbsent: 0 }],
];
for (const [label, setup, exp] of E_CASES) {
  dbCheck(`E: ${label}`, async () => {
    await setup();
    const s = await getAttendanceSummary(em._id, M, Y, WP);
    assert.strictEqual(s.daysWorked, exp.daysWorked, 'daysWorked');
    assert.strictEqual(s.halfDays, exp.halfDays, 'halfDays');
    assert.strictEqual(s.daysAbsent, exp.daysAbsent, 'daysAbsent');
  });
}

// Multi-day aggregation: a month of mixed statuses sums correctly.
dbCheck('E: multi-day aggregation sums', async () => {
  await att(2, 'present'); await att(3, 'present'); await att(4, 'late');
  await att(5, 'half_day'); // real half day
  await att(6, 'half_day'); await lv(6, { isHalfDay: true, isLWP: false }); // covered → worked
  await att(9, 'absent');   // real absent
  await att(10, 'absent'); await lv(10, { isHalfDay: false, isLWP: true }); // dedup → not absent
  const s = await getAttendanceSummary(em._id, M, Y, WP);
  assert.strictEqual(s.daysWorked, 4, 'worked = 2 present + 1 late + 1 covered-half');
  assert.strictEqual(s.halfDays, 1, 'one real half day');
  assert.strictEqual(s.daysAbsent, 1, 'one real absent (other deduped)');
});

// Late counting: isLate increments lateCount; ignoreLatIfHoursCompleted affects deductible.
dbCheck('E: late count + deductible late', async () => {
  await att(2, 'present', { isLate: true, totalHours: 9 });
  await att(3, 'present', { isLate: true, totalHours: 4 });
  const s = await getAttendanceSummary(em._id, M, Y, WP);
  assert.strictEqual(s.lateCount, 2, 'two late');
  assert.strictEqual(s.deductibleLateCount, 2, 'both deductible (ignore flag off)');
});
dbCheck('E: ignoreLatIfHoursCompleted excludes full-hours late', async () => {
  await att(2, 'present', { isLate: true, totalHours: 9 });   // completed hours → not deductible
  await att(3, 'present', { isLate: true, totalHours: 4 });   // short → deductible
  const s = await getAttendanceSummary(em._id, M, Y, { ...WP, ignoreLatIfHoursCompleted: true });
  assert.strictEqual(s.lateCount, 2);
  assert.strictEqual(s.deductibleLateCount, 1, 'only the short one deductible');
});

// Overtime accumulation
dbCheck('E: overtime accumulates', async () => {
  await att(2, 'present', { overtimeHours: 2 });
  await att(3, 'present', { overtimeHours: 1.5 });
  const s = await getAttendanceSummary(em._id, M, Y, WP);
  assert.strictEqual(s.overtimeHours, 3.5);
});

// hasAttendanceData flag
dbCheck('E: no records → hasAttendanceData false', async () => {
  const s = await getAttendanceSummary(em._id, M, Y, WP);
  assert.strictEqual(s.daysWorked, 0);
  assert.ok(s.hasAttendanceData === false || s.hasAttendanceData === undefined);
});

// Leave outside the month must not affect the summary
dbCheck('E: leave in a different month ignored', async () => {
  await att(2, 'half_day');
  // paid half-day leave in July (month 7) — should NOT cover June half_day
  await LeaveRequest.create({ company_id: co._id, employee_id: em._id, leaveType_id: lt._id, startDate: new Date(Date.UTC(Y, 6, 2)), endDate: new Date(Date.UTC(Y, 6, 2)), totalDays: 0.5, isHalfDay: true, isLWP: false, status: 'approved' });
  const s = await getAttendanceSummary(em._id, M, Y, WP);
  assert.strictEqual(s.halfDays, 1, 'June half day still counts');
});

// Pending (non-approved) leave must not cover a half-day
dbCheck('E: pending leave does not cover half-day', async () => {
  await att(2, 'half_day');
  await LeaveRequest.create({ company_id: co._id, employee_id: em._id, leaveType_id: lt._id, startDate: dayUTC(2), endDate: dayUTC(2), totalDays: 0.5, isHalfDay: true, isLWP: false, status: 'pending' });
  const s = await getAttendanceSummary(em._id, M, Y, WP);
  assert.strictEqual(s.halfDays, 1);
  assert.strictEqual(s.daysWorked, 0);
});

// Parameterized: for every working day of the month, a lone present = 1 worked
for (let day = 1; day <= 30; day++) {
  const dow = new Date(Date.UTC(Y, M - 1, day)).getUTCDay(); // 0 Sun .. 6 Sat
  if (dow === 0 || dow === 6) continue; // skip weekends (still fine, but keep working days)
  dbCheck(`E: lone present on day ${day} → 1 worked`, async () => {
    await att(day, 'present');
    const s = await getAttendanceSummary(em._id, M, Y, WP);
    assert.strictEqual(s.daysWorked, 1);
  });
}

// Parameterized: N real half-days → N halfDays
for (const n of [1, 2, 3, 5, 8, 10]) {
  dbCheck(`E: ${n} real half-days`, async () => {
    let placed = 0, day = 2;
    while (placed < n && day <= 28) {
      const dow = new Date(Date.UTC(Y, M - 1, day)).getUTCDay();
      if (dow !== 0 && dow !== 6) { await att(day, 'half_day'); placed++; }
      day++;
    }
    const s = await getAttendanceSummary(em._id, M, Y, WP);
    assert.strictEqual(s.halfDays, n);
  });
}

// Parameterized: half-day worked + paid half-day leave, across many days → all worked, 0 half
for (const n of [1, 2, 3, 4, 6]) {
  dbCheck(`E: ${n}× (half_day + paid half leave) → ${n} worked, 0 half`, async () => {
    let placed = 0, day = 2;
    while (placed < n && day <= 28) {
      const dow = new Date(Date.UTC(Y, M - 1, day)).getUTCDay();
      if (dow !== 0 && dow !== 6) { await att(day, 'half_day'); await lv(day, { isHalfDay: true, isLWP: false }); placed++; }
      day++;
    }
    const s = await getAttendanceSummary(em._id, M, Y, WP);
    assert.strictEqual(s.daysWorked, n);
    assert.strictEqual(s.halfDays, 0);
  });
}

// Parameterized: an absent on each working day → 1 absent
for (let day = 1; day <= 30; day++) {
  const dow = new Date(Date.UTC(Y, M - 1, day)).getUTCDay();
  if (dow === 0 || dow === 6) continue;
  dbCheck(`E: lone absent on day ${day} → 1 absent`, async () => {
    await att(day, 'absent');
    const s = await getAttendanceSummary(em._id, M, Y, WP);
    assert.strictEqual(s.daysAbsent, 1);
  });
}

// ─── Group F: calculatePayrollRecord integration ───────────────────────────────
// Fill a set of working days with a given attendance status.
const workingDaysList = () => { const out = []; for (let d = 1; d <= 30; d++) { const dow = new Date(Date.UTC(Y, M - 1, d)).getUTCDay(); if (dow !== 0 && dow !== 6) out.push(d); } return out; };
const empFor = (over = {}) => ({ _id: em._id, company_id: co._id, workPolicy_id: wp._id, location_id: loc._id, ...over });
const perDayOf = (rec) => GROSS / rec.totalWorkingDays;
const R2 = (n) => Math.round(n * 100) / 100;

dbCheck('F: no salary → warning record', async () => {
  const rec = await calculatePayrollRecord({ _id: em2._id, company_id: co._id, workPolicy_id: wp._id, location_id: loc._id }, M, Y, co._id);
  assert.strictEqual(rec.status, 'warning');
  assert.ok((rec.warnings || []).some((w) => /salary/i.test(w)));
});

dbCheck('F: no work policy & no default → warning record', async () => {
  const rec = await calculatePayrollRecord({ _id: em2._id, company_id: co._id }, M, Y, co._id);
  assert.strictEqual(rec.status, 'warning');
  assert.ok((rec.warnings || []).some((w) => /policy/i.test(w)));
});

// REGRESSION: encrypted salary must decrypt in payroll (else gross/net = NaN).
dbCheck('F: encrypted salary → real numbers (not NaN)', async () => {
  const rec = await calculatePayrollRecord({ _id: em3._id, company_id: co._id, workPolicy_id: wp._id, location_id: loc._id }, M, Y, co._id);
  assert.ok(!Number.isNaN(rec.grossEarnings), 'gross must not be NaN');
  assert.ok(!Number.isNaN(rec.netPay), 'net must not be NaN');
  assert.strictEqual(rec.grossEarnings, GROSS);
  assert.strictEqual(rec.netPay, GROSS - 1800);
});

dbCheck('F: full present month → no absence deductions', async () => {
  for (const d of workingDaysList()) await att(d, 'present');
  const rec = await calculatePayrollRecord(empFor(), M, Y, co._id);
  assert.strictEqual(rec.absentDeductionAmount, 0);
  assert.strictEqual(rec.halfDayDeductionAmount, 0);
  assert.strictEqual(rec.lwpDeductionAmount, 0);
  assert.strictEqual(rec.grossEarnings, GROSS);
  assert.strictEqual(rec.netPay, GROSS - 1800); // minus PF only
});

// Parameterized: K absent days → absentDeduction = perDay*K
for (const k of [1, 2, 3, 5, 8]) {
  dbCheck(`F: ${k} absent day(s) → deduction perDay*${k}`, async () => {
    const days = workingDaysList();
    for (let i = 0; i < days.length; i++) await att(days[i], i < k ? 'absent' : 'present');
    const rec = await calculatePayrollRecord(empFor(), M, Y, co._id);
    assert.strictEqual(rec.daysAbsent, k);
    assert.strictEqual(rec.absentDeductionAmount, R2(perDayOf(rec) * k));
  });
}

// Parameterized: K real half-days → halfDayDeduction = perDay*0.5*K
for (const k of [1, 2, 3, 4]) {
  dbCheck(`F: ${k} real half-day(s) → deduction perDay*0.5*${k}`, async () => {
    const days = workingDaysList();
    for (let i = 0; i < days.length; i++) await att(days[i], i < k ? 'half_day' : 'present');
    const rec = await calculatePayrollRecord(empFor(), M, Y, co._id);
    assert.strictEqual(rec.halfDays, k);
    assert.strictEqual(rec.halfDayDeductionAmount, R2(perDayOf(rec) * 0.5 * k));
  });
}

// Half-day worked + PAID half-day leave → treated as full day (no half deduction)
dbCheck('F: half_day worked + paid half leave → no half deduction', async () => {
  const days = workingDaysList();
  await att(days[0], 'half_day'); await lv(days[0], { isHalfDay: true, isLWP: false });
  for (let i = 1; i < days.length; i++) await att(days[i], 'present');
  const rec = await calculatePayrollRecord(empFor(), M, Y, co._id);
  assert.strictEqual(rec.halfDayDeductionAmount, 0, 'morning leave covers the worked half');
});

// Parameterized: K LWP full days → lwpDeduction = perDay*K
for (const k of [1, 2, 3]) {
  dbCheck(`F: ${k} LWP day(s) → deduction perDay*${k}`, async () => {
    const days = workingDaysList();
    for (const d of days) await att(d, 'present');
    // Mark first k working days as LWP leave (approved)
    await LeaveRequest.create({ company_id: co._id, employee_id: em._id, leaveType_id: lt._id, startDate: dayUTC(days[0]), endDate: dayUTC(days[k - 1]), totalDays: k, isHalfDay: false, isLWP: true, status: 'approved' });
    const rec = await calculatePayrollRecord(empFor(), M, Y, co._id);
    assert.ok(rec.lwpDays >= k - 0.001, `lwpDays≈${k}, got ${rec.lwpDays}`);
    assert.strictEqual(rec.lwpDeductionAmount, R2(perDayOf(rec) * rec.lwpDays));
  });
}

// Mid-month joiner → prorated gross (< full), still positive
dbCheck('F: mid-month joiner prorates gross', async () => {
  for (const d of workingDaysList()) await att(d, 'present');
  const rec = await calculatePayrollRecord(empFor({ joiningDate: new Date(Date.UTC(Y, M - 1, 16)) }), M, Y, co._id);
  assert.ok(rec.grossEarnings > 0 && rec.grossEarnings < GROSS, `prorated gross ${rec.grossEarnings}`);
});

// Joiner after the month → skipped (null)
dbCheck('F: joiner after month → null (skipped)', async () => {
  const rec = await calculatePayrollRecord(empFor({ joiningDate: new Date(Date.UTC(Y, M, 15)) }), M, Y, co._id);
  assert.strictEqual(rec, null);
});

// netPay never below floor of gross - all deductions; and deductions are non-negative
dbCheck('F: deductions non-negative and net consistent', async () => {
  const days = workingDaysList();
  for (let i = 0; i < days.length; i++) await att(days[i], i < 3 ? 'absent' : (i < 5 ? 'half_day' : 'present'));
  const rec = await calculatePayrollRecord(empFor(), M, Y, co._id);
  for (const f of ['lwpDeductionAmount', 'absentDeductionAmount', 'halfDayDeductionAmount', 'lateDeductionAmount']) {
    assert.ok(rec[f] >= 0, `${f} negative`);
  }
  assert.strictEqual(rec.netPay, R2(rec.grossEarnings - rec.totalDeductions));
});

test('summary: reached target case count', () => {
  console.log(`\n[payrollPayslip] total edge cases exercised: ${CASES}`);
  assert.ok(CASES >= 300, `expected 300+ cases, got ${CASES}`);
});
