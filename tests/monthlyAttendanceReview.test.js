/**
 * Monthly Attendance Review rule: day gating, previous-month label, and who gets notified.
 * DB models are stubbed, so no database is needed.
 */
const test   = require('node:test');
const assert = require('node:assert');
const Company  = require('../src/models/Company');
const Employee = require('../src/models/Employee');
const NotificationRule = require('../src/models/NotificationRule');
const { DEFAULT_RULES, ensureDefaultRule } = require('../src/seeders/notificationRules.seeder');
const registry = require('../src/services/ruleEngine/registry');
const handler  = require('../src/services/ruleEngine/handlers/monthlyAttendanceReview');

const { getMonthContext, findRecipients, slug } = handler;

// Stand-in for a Mongoose query chain: .select().lean() resolves to `result`.
const query = (result) => ({ select: () => ({ lean: async () => result }) });

// Freezes "now" and stubs the company timezone and the employee lookup. Returns the filter used.
const setup = (t, { now, timezone = 'Asia/Kolkata', employees = [] }) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(now) });
  t.mock.method(Company, 'findById', () => query({ settings: { timezone } }));
  const calls = [];
  t.mock.method(Employee, 'find', (filter) => { calls.push(filter); return query(employees); });
  return calls;
};

const emp = (id, first, user = `u-${id}`) => ({ _id: id, firstName: first, lastName: 'Test', user_id: user });

test('getMonthContext: previous month label and day in the company timezone', () => {
  assert.deepStrictEqual(getMonthContext(new Date('2026-11-01T04:00:00Z'), 'Asia/Kolkata'), { day: 1, monthName: 'October 2026' });
  assert.deepStrictEqual(getMonthContext(new Date('2027-01-01T04:00:00Z'), 'Asia/Kolkata'), { day: 1, monthName: 'December 2026' });
});

test('getMonthContext: timezone decides the day (UTC still Oct 31, IST already Nov 1)', () => {
  const instant = new Date('2026-10-31T20:00:00Z');
  assert.strictEqual(getMonthContext(instant, 'Asia/Kolkata').day, 1);
  assert.strictEqual(getMonthContext(instant, 'UTC').day, 31);
});

test('slug matches the registry and the default rule', () => {
  assert.strictEqual(slug, 'monthly-attendance-review');
  assert.strictEqual(registry[slug], handler);
  assert.ok(DEFAULT_RULES.some((r) => r.slug === slug));
});

test('default rule is off, in-app only, and runs on day 1 for everyone', () => {
  const rule = DEFAULT_RULES.find((r) => r.slug === slug);
  assert.strictEqual(rule.isEnabled, false);
  assert.deepStrictEqual(rule.channels, { inApp: true, email: false });
  assert.strictEqual(rule.config.dayOfMonth, 1);
  assert.strictEqual(rule.config.audience, 'all');
  assert.match(rule.templates.inApp.body, /\{\{monthName\}\}/);
  assert.match(rule.templates.inApp.body, /Vishwas Tupe/);
});

test('sends nobody when today is not the configured day', async (t) => {
  const calls = setup(t, { now: '2026-11-02T04:00:00Z', employees: [emp('1', 'Amit')] });
  assert.deepStrictEqual(await findRecipients('c1', {}, { dayOfMonth: 1, audience: 'all' }), []);
  assert.strictEqual(calls.length, 0, 'must not even query employees');
});

test('everyone: active + notice employees with a login, on the configured day', async (t) => {
  const calls = setup(t, { now: '2026-11-01T04:00:00Z', employees: [emp('1', 'Amit'), emp('2', 'Priya')] });
  const out = await findRecipients('c1', {}, { dayOfMonth: 1, audience: 'all' });

  assert.deepStrictEqual(calls[0], { company_id: 'c1', status: { $in: ['active', 'notice'] }, user_id: { $ne: null } });
  assert.deepStrictEqual(out.map((r) => r.userId), ['u-1', 'u-2']);
  assert.deepStrictEqual(out[0].variables, { employeeName: 'Amit Test', monthName: 'October 2026' });
  assert.strictEqual(out[0].actionUrl, '/dashboard/attendance/my');
});

test('selected: restricts to the chosen employee ids, still scoped to the company', async (t) => {
  const calls = setup(t, { now: '2026-11-01T04:00:00Z', employees: [emp('2', 'Priya')] });
  const out = await findRecipients('c1', {}, { dayOfMonth: 1, audience: 'selected', employeeIds: ['2', '9'] });

  assert.deepStrictEqual(calls[0]._id, { $in: ['2', '9'] });
  assert.strictEqual(calls[0].company_id, 'c1');
  assert.deepStrictEqual(out.map((r) => r.userId), ['u-2']);
});

test('selected with nobody chosen matches nobody', async (t) => {
  const calls = setup(t, { now: '2026-11-01T04:00:00Z' });
  await findRecipients('c1', {}, { dayOfMonth: 1, audience: 'selected' });
  assert.deepStrictEqual(calls[0]._id, { $in: [] });
});

test('dayOfMonth defaults to 1 and honours a custom day', async (t) => {
  setup(t, { now: '2026-11-15T04:00:00Z', employees: [emp('1', 'Amit')] });
  assert.strictEqual((await findRecipients('c1', {}, {})).length, 0);
  assert.strictEqual((await findRecipients('c1', {}, { dayOfMonth: 15 })).length, 1);
});

test('a database error returns no recipients instead of throwing', async (t) => {
  t.mock.method(Company, 'findById', () => { throw new Error('db down'); });
  t.mock.method(console, 'error', () => {});
  assert.deepStrictEqual(await findRecipients('c1', {}, {}), []);
});

test('rule schema accepts the new settings and rejects bad values', () => {
  const check = (config) => new NotificationRule({
    company_id: '64b000000000000000000001', slug, name: 'x', triggerType: 'cron', config,
  }).validateSync();

  assert.strictEqual(check({ dayOfMonth: 1, audience: 'selected', employeeIds: ['64b000000000000000000002'] }), undefined);
  assert.ok(check({ audience: 'nobody' }));
  assert.ok(check({ dayOfMonth: 29 }));
  assert.ok(check({ dayOfMonth: 0 }));
  assert.ok(check({ employeeIds: Array.from({ length: 2001 }, () => '64b000000000000000000002') }));
});

test('ensureDefaultRule: adds the missing rule only for companies that already have rules', async (t) => {
  const upsert = t.mock.method(NotificationRule, 'updateOne', async () => ({}));
  t.mock.method(NotificationRule, 'countDocuments', async () => 5);

  await ensureDefaultRule('c1', slug);

  const [filter, update, options] = upsert.mock.calls[0].arguments;
  assert.deepStrictEqual(filter, { company_id: 'c1', slug });
  assert.strictEqual(update.$setOnInsert.name, 'Monthly Attendance Review');
  assert.strictEqual(update.$setOnInsert.company_id, 'c1');
  assert.strictEqual(options.upsert, true);
});

test('ensureDefaultRule: leaves a brand-new company to the signup seeder', async (t) => {
  const upsert = t.mock.method(NotificationRule, 'updateOne', async () => ({}));
  t.mock.method(NotificationRule, 'countDocuments', async () => 0);

  await ensureDefaultRule('c1', slug);
  assert.strictEqual(upsert.mock.calls.length, 0);
});

test('ensureDefaultRule: a database error is logged, never thrown (must not block server start)', async (t) => {
  t.mock.method(NotificationRule, 'countDocuments', async () => { throw new Error('db down'); });
  const log = t.mock.method(console, 'error', () => {});

  await assert.doesNotReject(ensureDefaultRule('c1', slug));
  assert.strictEqual(log.mock.calls.length, 1);
});
