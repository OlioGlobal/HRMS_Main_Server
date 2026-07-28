/**
 * End-to-end verification of calculateLeaveDays across leave-type / holiday /
 * weekend configs — run under IST to prove the civil-day fix is timezone-safe.
 * Requires a local MongoDB (self-skips if unreachable).
 *
 * 2026 calendar facts used below:
 *   Jan 1 Thu · Jan 26 Mon(Republic) · Feb 16 Mon(L1 holiday) · Mar 3 Tue(Holi)
 *   Nov 6 Fri(optional) · Dec 25 2025 Thu · weekends default SAT/SUN
 */
const test     = require('node:test');
const assert   = require('node:assert');
const mongoose = require('mongoose');

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'a'.repeat(64);

const Company                 = require('../src/models/Company');
const Employee                = require('../src/models/Employee');
const PublicHoliday           = require('../src/models/PublicHoliday');
const EmployeeOptionalHoliday = require('../src/models/EmployeeOptionalHoliday');
const { calculateLeaveDays }  = require('../src/utils/calculateLeaveDays');

const oid = () => new mongoose.Types.ObjectId();
const L1 = oid(); // employee's location
const L2 = oid(); // a different location

let connected = false;
let company, E1, E2;

const noon = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 12)); };
const holi = (name, dateStr, extra = {}) => ({
  company_id: company._id, name, date: noon(dateStr), year: Number(dateStr.slice(0, 4)),
  isActive: true, isOptional: false, location_id: null, type: 'national', ...extra,
});

test.before(async () => {
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/hrms_leavedays_test', { serverSelectionTimeoutMS: 3000 });
    connected = true;

    company = await Company.create({ name: 'LeaveDays Co', slug: `ld-${Date.now()}`, email: `ld-${Date.now()}@t.dev` });
    E1 = await Employee.create({ company_id: company._id, firstName: 'Emp', lastName: 'One', location_id: L1 });
    E2 = await Employee.create({ company_id: company._id, firstName: 'Emp', lastName: 'Two', location_id: L2 });

    const holidays = await PublicHoliday.create([
      holi('New Year',      '2026-01-01'),
      holi('Republic Day',  '2026-01-26'),
      holi('Holi',          '2026-03-03'),
      holi('Founders Day',  '2026-02-16', { location_id: L1, type: 'company' }),   // location-specific
      holi('Extra Diwali',  '2026-11-06', { isOptional: true, type: 'optional' }), // optional (Fri)
      holi('Christmas 25',  '2025-12-25'),
    ]);
    const optional = holidays.find((h) => h.name === 'Extra Diwali');
    // E1 picks the optional holiday; E2 does not
    await EmployeeOptionalHoliday.create({ company_id: company._id, employee_id: E1._id, holiday_id: optional._id, year: 2026 });
  } catch (e) {
    console.warn('[leaveDays.test] MongoDB unavailable — skipping:', e.message);
  }
});

test.after(async () => {
  if (connected) {
    await Promise.all([
      Company.deleteMany({ _id: company._id }),
      Employee.deleteMany({ company_id: company._id }),
      PublicHoliday.deleteMany({ company_id: company._id }),
      EmployeeOptionalHoliday.deleteMany({ company_id: company._id }),
    ]);
    await mongoose.disconnect();
  }
});

test('30+ calculateLeaveDays cases (IST-safe)', async (t) => {
  if (!connected) return t.skip('no MongoDB');

  const base = (over = {}) => ({
    companyId: company._id, employeeId: E1._id, locationId: L1,
    weekendDays: ['SAT', 'SUN'], countWeekends: false, countHolidays: false, ...over,
  });

  // [label, start, end, opts, expected]
  const cases = [
    // ── weekends ──
    ['Mon–Fri, no holiday',                 '2026-01-05', '2026-01-09', base(), 5],
    ['Mon–Sun excludes Sat+Sun',            '2026-01-05', '2026-01-11', base(), 5],
    ['Sat only',                            '2026-01-10', '2026-01-10', base(), 0],
    ['Sun only',                            '2026-01-11', '2026-01-11', base(), 0],
    ['Sat–Sun',                             '2026-01-10', '2026-01-11', base(), 0],
    ['Fri–Mon spanning weekend',            '2026-01-09', '2026-01-12', base(), 2],
    ['countWeekends: Sat–Sun',              '2026-01-10', '2026-01-11', base({ countWeekends: true }), 2],
    ['countWeekends: Mon–Sun',              '2026-01-05', '2026-01-11', base({ countWeekends: true }), 7],

    // ── holidays (company-wide) ──
    ['single day ON Republic Day (Mon)',    '2026-01-26', '2026-01-26', base(), 0],
    ['Mon(holiday)–Wed',                    '2026-01-26', '2026-01-28', base(), 2],
    ['Fri–Tue across weekend+holiday',      '2026-01-23', '2026-01-27', base(), 2],
    ['single day ON Holi (Tue)',            '2026-03-03', '2026-03-03', base(), 0],
    ['Mon–Wed around Holi',                 '2026-03-02', '2026-03-04', base(), 2],
    ['countHolidays: Republic single',      '2026-01-26', '2026-01-26', base({ countHolidays: true }), 1],
    ['countHolidays: Mon–Wed',              '2026-01-26', '2026-01-28', base({ countHolidays: true }), 3],

    // ── location-specific holiday (Feb 16 Mon, L1 only) ──
    ['L1 employee on L1 holiday',           '2026-02-16', '2026-02-16', base(), 0],
    ['no location → L1 holiday not applied','2026-02-16', '2026-02-16', base({ locationId: null }), 1],
    ['L2 location → L1 holiday not applied','2026-02-16', '2026-02-16', base({ locationId: L2 }), 1],
    ['L1: Sun–Tue around L1 holiday',       '2026-02-15', '2026-02-17', base(), 1],
    ['L2: Sun–Tue (no L1 holiday)',         '2026-02-15', '2026-02-17', base({ locationId: L2 }), 2],

    // ── optional holiday (Nov 6 Fri) ──
    ['E1 picked optional → excluded',       '2026-11-06', '2026-11-06', base(), 0],
    ['E2 did NOT pick → counted',           '2026-11-06', '2026-11-06', base({ employeeId: E2._id, locationId: L2 }), 1],
    ['countHolidays overrides optional',    '2026-11-06', '2026-11-06', base({ countHolidays: true }), 1],

    // ── custom weekend config ──
    ['FRI/SAT weekend: Fri–Sat',            '2026-01-09', '2026-01-10', base({ weekendDays: ['FRI', 'SAT'] }), 0],
    ['FRI/SAT weekend: Sunday is workday',  '2026-01-11', '2026-01-11', base({ weekendDays: ['FRI', 'SAT'] }), 1],
    ['FRI/SAT weekend: Thu–Sun',            '2026-01-08', '2026-01-11', base({ weekendDays: ['FRI', 'SAT'] }), 2],
    ['single SUN weekend: Sat–Sun',         '2026-01-10', '2026-01-11', base({ weekendDays: ['SUN'] }), 1],

    // ── year boundary / multi-month ──
    ['spans New Year (Jan 1 holiday)',      '2025-12-29', '2026-01-02', base(), 4],
    ['Dec 2025 around Xmas',                '2025-12-24', '2025-12-26', base(), 2],
    ['full January 2026',                   '2026-01-01', '2026-01-31', base(), 20],
    ['12-day span Mon→Fri',                 '2026-01-05', '2026-01-16', base(), 10],
    ['single weekday',                      '2026-01-27', '2026-01-27', base(), 1],

    // ── cross-flag interactions ──
    ['both counts: Sat–Wed w/ holiday',     '2026-01-24', '2026-01-28', base({ countWeekends: true, countHolidays: true }), 5],
    ['countWeekends only: Sat–Mon(hol)',    '2026-01-24', '2026-01-26', base({ countWeekends: true }), 2],
    ['countHolidays only: Sat–Mon(hol)',    '2026-01-24', '2026-01-26', base({ countHolidays: true }), 1],
  ];

  let pass = 0;
  for (const [label, start, end, opts, expected] of cases) {
    const actual = await calculateLeaveDays(start, end, opts);
    await t.test(`${label} [${start}→${end}]`, () => {
      assert.strictEqual(actual, expected, `expected ${expected}, got ${actual}`);
    });
    pass++;
  }
  console.log(`  → ran ${pass} calculateLeaveDays cases`);
  assert.ok(pass >= 30, 'should run at least 30 cases');
});
