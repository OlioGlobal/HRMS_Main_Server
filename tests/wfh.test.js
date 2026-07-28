/**
 * WFH module — config-aware tests.
 *  - isWFHAuthorized precedence: workMode(wfh/field) → hybrid wfhDays → approved request
 *  - apply / approve / reject / cancel lifecycle + guards
 * Real services + local MongoDB, under IST. Self-skips if no DB.
 *
 * 2026 weekday facts: Mar 2 Mon · Mar 4 Wed · Mar 6 Fri · Mar 10 Tue · Mar 11 Wed
 */
const test     = require('node:test');
const assert   = require('node:assert');
const mongoose = require('mongoose');

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'a'.repeat(64);

const Company    = require('../src/models/Company');
const Employee   = require('../src/models/Employee');
const WorkPolicy = require('../src/models/WorkPolicy');
const WFHRequest = require('../src/models/WFHRequest');
const Location   = require('../src/models/Location');
const svc        = require('../src/services/wfh/wfh.service');
const { resolveEmployeeTimezone } = require('../src/utils/resolveTimezone');

const oid = () => new mongoose.Types.ObjectId();
// Civil (noon-UTC) — how applyWFH now stores dates.
const civil = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 12)); };
const ymdLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };

let connected = false;
let company, policyHybrid, policyPlain;
let empOffice, empWfh, empField, empNoPolicy, empReq;

test.before(async () => {
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/hrms_wfh_test', { serverSelectionTimeoutMS: 3000 });
    connected = true;

    company = await Company.create({ name: 'WFH Co', slug: `wfh-${Date.now()}`, email: `wfh-${Date.now()}@t.dev`, settings: { timezone: 'Asia/Kolkata' } });
    const LOC = oid();
    policyHybrid = await WorkPolicy.create({ company_id: company._id, location_id: LOC, name: 'Hybrid', hybridEnabled: true,  wfhDays: ['WED', 'FRI'] });
    policyPlain  = await WorkPolicy.create({ company_id: company._id, location_id: LOC, name: 'Plain',  hybridEnabled: false, wfhDays: ['WED', 'FRI'] });

    empOffice   = await Employee.create({ company_id: company._id, firstName: 'Off', lastName: 'Ice',  workMode: 'office', workPolicy_id: policyHybrid._id, status: 'active' });
    empWfh      = await Employee.create({ company_id: company._id, firstName: 'Wf',  lastName: 'H',    workMode: 'wfh',    status: 'active' });
    empField    = await Employee.create({ company_id: company._id, firstName: 'Fie', lastName: 'Ld',   workMode: 'field',  status: 'active' });
    empNoPolicy = await Employee.create({ company_id: company._id, firstName: 'No',  lastName: 'Pol',  workMode: 'office', status: 'active' });
    empReq      = await Employee.create({ company_id: company._id, firstName: 'Req', lastName: 'Emp',  workMode: 'office', workPolicy_id: policyPlain._id, status: 'active' });
  } catch (e) {
    console.warn('[wfh.test] MongoDB unavailable — skipping:', e.message);
  }
});

test.after(async () => {
  if (connected) {
    await Promise.all([
      Company.deleteMany({ _id: company._id }),
      Employee.deleteMany({ company_id: company._id }),
      WorkPolicy.deleteMany({ company_id: company._id }),
      WFHRequest.deleteMany({ company_id: company._id }),
      Location.deleteMany({ company_id: company._id }),
    ]);
    await mongoose.disconnect();
  }
});

const auth = (emp, date) => svc.isWFHAuthorized(company._id, emp._id, date);

// ── isWFHAuthorized — config precedence ──
test('workMode=wfh → always authorized', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  const r = await auth(empWfh, '2026-03-02'); // a Monday, no policy/request
  assert.strictEqual(r.authorized, true);
});

test('workMode=field → always authorized', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  assert.strictEqual((await auth(empField, '2026-03-02')).authorized, true);
});

test('office + hybrid policy, date IS a wfhDay (Wed) → authorized', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  assert.strictEqual((await auth(empOffice, '2026-03-04')).authorized, true);
});

test('office + hybrid policy, date is NOT a wfhDay (Mon) → not authorized', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  assert.strictEqual((await auth(empOffice, '2026-03-02')).authorized, false);
});

test('office + hybrid DISABLED policy, wfhDay → not authorized', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  assert.strictEqual((await auth(empReq, '2026-03-04')).authorized, false); // Wed but hybridEnabled=false
});

test('office, no policy, no request → not authorized', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  assert.strictEqual((await auth(empNoPolicy, '2026-03-04')).authorized, false);
});

test('office + APPROVED request covering date → authorized', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await WFHRequest.deleteMany({ employee_id: empReq._id });
  await WFHRequest.create({ company_id: company._id, employee_id: empReq._id, startDate: civil('2026-03-10'), endDate: civil('2026-03-12'), status: 'approved' });
  assert.strictEqual((await auth(empReq, '2026-03-10')).authorized, true); // Tue, not wfhDay → request path
});

test('office + PENDING request → not authorized', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await WFHRequest.deleteMany({ employee_id: empReq._id });
  await WFHRequest.create({ company_id: company._id, employee_id: empReq._id, startDate: civil('2026-03-10'), endDate: civil('2026-03-12'), status: 'pending' });
  assert.strictEqual((await auth(empReq, '2026-03-10')).authorized, false);
});

test('office + approved request NOT covering date → not authorized', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await WFHRequest.deleteMany({ employee_id: empReq._id });
  await WFHRequest.create({ company_id: company._id, employee_id: empReq._id, startDate: civil('2026-03-10'), endDate: civil('2026-03-12'), status: 'approved' });
  assert.strictEqual((await auth(empReq, '2026-03-17')).authorized, false); // Tue outside range
});

test('unknown employee → not authorized', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  assert.strictEqual((await auth({ _id: oid() }, '2026-03-04')).authorized, false);
});

test('timezone resolution: employee Location tz overrides company tz', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  const loc = await Location.create({ company_id: company._id, name: `NY-${Date.now()}`, country: 'USA', timezone: 'America/New_York' });
  assert.strictEqual(await resolveEmployeeTimezone({ company_id: company._id, location_id: loc._id }, company._id), 'America/New_York');
  assert.strictEqual(await resolveEmployeeTimezone({ company_id: company._id }, company._id), 'Asia/Kolkata'); // no location → company
  assert.strictEqual(await resolveEmployeeTimezone({}, null), 'UTC');                                          // neither → UTC
});

// ── apply / lifecycle ──
const applyFor = (emp, startOffset, endOffset = startOffset, extra = {}) =>
  svc.applyWFH(company._id, emp._id, { startDate: ymdLocal(addDays(startOffset)), endDate: ymdLocal(addDays(endOffset)), ...extra });

test('apply future WFH → pending', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await WFHRequest.deleteMany({ employee_id: empOffice._id });
  const r = await applyFor(empOffice, 10);
  assert.strictEqual(r.status, 'pending');
});

test('apply past date → blocked', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await WFHRequest.deleteMany({ employee_id: empOffice._id });
  await assert.rejects(() => applyFor(empOffice, -5), /today or in the future/i);
});

test('end before start → blocked', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await WFHRequest.deleteMany({ employee_id: empOffice._id });
  await assert.rejects(() => applyFor(empOffice, 12, 10), /End date cannot be before/i);
});

test('overlapping WFH request → blocked; re-apply after cancel → allowed', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await WFHRequest.deleteMany({ employee_id: empOffice._id });
  const first = await applyFor(empOffice, 10, 12);
  await assert.rejects(() => applyFor(empOffice, 11, 13), /overlaps/i);
  await svc.cancelRequest(company._id, first._id, empOffice._id);
  const again = await applyFor(empOffice, 10, 12);
  assert.strictEqual(again.status, 'pending');
});

test('approve → approved; approving again → blocked', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await WFHRequest.deleteMany({ employee_id: empOffice._id });
  const r = await applyFor(empOffice, 20);
  const approved = await svc.approveRequest(company._id, r._id, oid());
  assert.strictEqual(approved.status, 'approved');
  await assert.rejects(() => svc.approveRequest(company._id, r._id, oid()), /Cannot approve/i);
});

test('reject → rejected with reason', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await WFHRequest.deleteMany({ employee_id: empOffice._id });
  const r = await applyFor(empOffice, 21);
  const rej = await svc.rejectRequest(company._id, r._id, oid(), 'Team on-site day');
  assert.strictEqual(rej.status, 'rejected');
  assert.match(rej.rejectedReason, /on-site/i);
});

test('cancel pending → cancelled; cannot cancel an approved one', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await WFHRequest.deleteMany({ employee_id: empOffice._id });
  const p = await applyFor(empOffice, 22);
  const c = await svc.cancelRequest(company._id, p._id, empOffice._id);
  assert.strictEqual(c.status, 'cancelled');

  const a = await applyFor(empOffice, 23);
  await svc.approveRequest(company._id, a._id, oid());
  await assert.rejects(() => svc.cancelRequest(company._id, a._id, empOffice._id), /Cannot cancel/i);
});

test('cancel / approve a non-existent request → 404', async (t) => {
  if (!connected) return t.skip('no MongoDB');
  await assert.rejects(() => svc.approveRequest(company._id, oid(), oid()), /not found/i);
  await assert.rejects(() => svc.cancelRequest(company._id, oid(), empOffice._id), /not found/i);
});
