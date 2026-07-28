/**
 * Empirical verification of leave-module edge cases.
 * Read-only: injects fake holiday models (no DB), runs the REAL functions.
 * Run under different timezones:  TZ=Asia/Kolkata node scripts/leave-tz-check.js
 *                                 TZ=UTC          node scripts/leave-tz-check.js
 */
const path = require('path');

const offsetMin = -new Date('2026-01-15T00:00:00').getTimezoneOffset(); // minutes east of UTC
console.log(`\n=== TZ=${process.env.TZ || '(system)'}  offset=${offsetMin >= 0 ? '+' : ''}${offsetMin}min ===\n`);

// ── Inject fake models so calculateLeaveDays runs without a DB ──
// Republic Day 26 Jan 2026 stored EXACTLY like holiday.service.toNoonUTC → noon UTC.
const holidayDocs = [{ date: new Date(Date.UTC(2026, 0, 26, 12, 0, 0)) }];
const chain = (result) => ({ select() { return this; }, populate() { return this; }, lean() { return Promise.resolve(result); } });
const inject = (relFromModels, exportsObj) => {
  const abs = require.resolve(path.join(__dirname, '..', 'src', 'models', relFromModels));
  require.cache[abs] = { id: abs, filename: abs, loaded: true, exports: exportsObj };
};
inject('PublicHoliday.js', { find: () => chain(holidayDocs) });
inject('EmployeeOptionalHoliday.js', { find: () => chain([]) });

const { calculateLeaveDays } = require('../src/utils/calculateLeaveDays');
const { getLeaveYear } = require('../src/utils/getLeaveYear');

const line = (label, actual, expected) => {
  const ok = actual === expected;
  console.log(`${ok ? '✅' : '❌ BUG'}  ${label}\n        expected=${JSON.stringify(expected)}  actual=${JSON.stringify(actual)}`);
};

(async () => {
  // ── #0  CREATION STORAGE: same "2026-01-26" input, two different normalizations
  const INPUT = '2026-01-26';

  // Holiday creation (holiday.service.toNoonUTC)
  const _h = new Date(INPUT);
  const holidayStored = new Date(Date.UTC(_h.getFullYear(), _h.getMonth(), _h.getDate(), 12, 0, 0));

  // Leave creation (applyLeave: new Date + setHours(0,0,0,0))
  const leaveStored = new Date(INPUT); leaveStored.setHours(0, 0, 0, 0);

  const hDay = holidayStored.toISOString().split('T')[0];
  const lDay = leaveStored.toISOString().split('T')[0];
  console.log(`--- CREATION STORAGE for input "${INPUT}" ---`);
  console.log(`   holiday.service → ${holidayStored.toISOString()}  (calendar day ${hDay})`);
  console.log(`   applyLeave      → ${leaveStored.toISOString()}  (calendar day ${lDay})`);
  line('#0 both creation paths store the SAME calendar day', hDay === lDay, true);
  console.log('');

  const opts = { companyId: 'c', employeeId: null, weekendDays: ['SAT', 'SUN'], countWeekends: false, countHolidays: false };

  // ── #1a  LEAVE CREATION on a public holiday ──────────────────────────────────
  // Apply for a single day = 26 Jan 2026 (Republic Day, a Monday).
  // Correct working days = 0 → applyLeave would throw "No working days".
  const holidayOnly = await calculateLeaveDays('2026-01-26', '2026-01-26', opts);
  line('#1a single-day leave ON 26-Jan holiday → 0 working days (creation blocked)', holidayOnly, 0);
  console.log(`        actual=${holidayOnly} → ${holidayOnly > 0 ? 'leave is CREATED on a public holiday & deducts balance' : 'correctly blocked'}`);

  // ── #1b  Which day actually gets excluded in a Mon–Wed span ──────────────────
  // Jan 26(Mon=holiday) 27(Tue) 28(Wed). Correct working days = 2 (27 & 28).
  const span = await calculateLeaveDays('2026-01-26', '2026-01-28', opts);
  line('#1b span 26–28 Jan working days', span, 2);
  const DAY = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const cell = new Date('2026-01-26'); cell.setHours(0, 0, 0, 0);
  console.log(`        26-Jan cell → weekday(getDay,local)=${DAY[cell.getDay()]}  holidayKey(toISOString,UTC)=${cell.toISOString().split('T')[0]}  (holiday stored 2026-01-26)`);
  console.log(`        → the holiday key matches the cell one day LATER, so 27-Jan (Tue) is excluded instead of 26-Jan`);

  // ── #2  Year filter misfiles a 1-Jan leave ───────────────────────────────────
  const startDate = new Date('2026-01-01'); startDate.setHours(0, 0, 0, 0); // as applyLeave stores it
  const yearLo = new Date('2026-01-01');    // as getMyLeaves builds the filter
  const yearHi = new Date('2026-12-31');
  const inYear2026 = startDate >= yearLo && startDate <= yearHi;
  line('#2 1-Jan-2026 leave appears under year=2026 filter', inYear2026, true);
  console.log(`        stored startDate=${startDate.toISOString()}  filter.$gte=${yearLo.toISOString()}`);

  // ── #3  getLeaveYear bucket for a 1-Jan leave (calendar reset) ───────────────
  const y = getLeaveYear(startDate, 'calendar_year', 1);
  line('#3 getLeaveYear(1-Jan-2026 stored date, calendar) buckets to 2026', y, 2026);

  // ── #5  assign-year vs apply-year mismatch (fiscal Apr) ──────────────────────
  // Assigned in Feb 2026 → balance year; applies for leave in May 2026 → lookup year
  const assignYear = getLeaveYear(new Date('2026-02-10'), 'fiscal_year', 4);
  const applyYear  = getLeaveYear(new Date('2026-05-10'), 'fiscal_year', 4);
  const sameKey = assignYear === applyYear;
  line('#5 balance year key matches between assign(Feb) and apply(May)', sameKey, true);
  console.log(`        assignYear=${assignYear}  applyYear=${applyYear}  → mismatch means leave silently LWP`);

  console.log('');
})();
