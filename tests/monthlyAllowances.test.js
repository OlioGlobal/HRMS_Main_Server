/**
 * Monthly flexi / early-exit allowance logic (classifyDay + applyAllowance).
 * Pure functions — no DB. Policy mirrors Olio config:
 *   10:00-19:00, grace 30, half-day-below 9, cutoff 11:00, flexi 3/mo, early-exit 1/mo.
 */
const test   = require('node:test');
const assert = require('node:assert');
const { calculateAttendanceStatus } = require('../src/utils/calculateAttendanceStatus');
const { classifyDay, applyAllowance } = require('../src/utils/monthlyAllowances');

const DATE = '2026-08-18';
const [Y, M, D] = DATE.split('-').map(Number);
const dateRef = new Date(Date.UTC(Y, M - 1, D));
const IST = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return new Date(Date.UTC(Y, M - 1, D, h, m) - 330 * 60000); };

const policy = {
  workStart: '10:00', workEnd: '19:00', graceMinutes: 30, lateMarkAfterMinutes: 60,
  halfDayThresholdHours: 9, absentThresholdHours: 2, overtimeThresholdHours: 9,
  halfDayIfClockInAfter: '11:00', ignoreHalfDayIfFullHours: false,
  flexiLateInsPerMonth: 3, earlyExitsPerMonth: 1,
};
const base = (inn, out) => calculateAttendanceStatus(IST(inn), out ? IST(out) : null, policy, dateRef, 'Asia/Kolkata');
const cls  = (inn, out) => classifyDay(base(inn, out), IST(inn), out ? IST(out) : null, policy, dateRef, 'Asia/Kolkata');

// ── classifyDay ──
test('late arrival before cutoff → flexi late-in', () => {
  const c = cls('10:45', '19:45');
  assert.equal(c.isFlexiLateIn, true);
  assert.equal(c.isEarlyExit, false);
});

test('arrival after 11:00 cutoff → NOT flexi (hard half-day)', () => {
  const c = cls('11:15', '20:15');
  assert.equal(c.isFlexiLateIn, false);
  assert.equal(c.isEarlyExit, false);
});

test('on-time but left early (short hours) → early exit', () => {
  const c = cls('10:00', '16:00');
  assert.equal(c.isEarlyExit, true);
  assert.equal(c.isFlexiLateIn, false);
});

test('on-time full day → neither', () => {
  const c = cls('10:00', '19:00');
  assert.equal(c.isFlexiLateIn, false);
  assert.equal(c.isEarlyExit, false);
});

test('absent (too few hours) → neither', () => {
  const c = cls('10:00', '11:00');
  assert.equal(base('10:00', '11:00').status, 'absent');
  assert.equal(c.isFlexiLateIn, false);
  assert.equal(c.isEarlyExit, false);
});

// ── applyAllowance: flexi ──
test('flexi within quota (prior 2 of 3) → forgiven, stays full day', () => {
  const b = { status: 'present', isLate: true };
  const r = applyAllowance(b, { isFlexiLateIn: true, isEarlyExit: false }, { policy, priorFlexi: 2, priorEarlyExit: 0 });
  assert.equal(r.status, 'present');
  assert.equal(r.flexiForgiven, true);
  assert.equal(r.flexiEscalated, false);
});

test('flexi 4th of month (prior 3 of 3) → escalates to half_day', () => {
  const b = { status: 'present', isLate: true };
  const r = applyAllowance(b, { isFlexiLateIn: true, isEarlyExit: false }, { policy, priorFlexi: 3, priorEarlyExit: 0 });
  assert.equal(r.status, 'half_day');
  assert.equal(r.flexiEscalated, true);
});

test('flexi disabled (quota 0) → never escalates', () => {
  const b = { status: 'present', isLate: true };
  const r = applyAllowance(b, { isFlexiLateIn: true, isEarlyExit: false }, { policy: { ...policy, flexiLateInsPerMonth: 0 }, priorFlexi: 9, priorEarlyExit: 0 });
  assert.equal(r.status, 'present');
});

// ── applyAllowance: early exit ──
test('early exit within quota (prior 0 of 1) → forgiven to present', () => {
  const b = { status: 'half_day', isLate: false };
  const r = applyAllowance(b, { isFlexiLateIn: false, isEarlyExit: true }, { policy, priorFlexi: 0, priorEarlyExit: 0 });
  assert.equal(r.status, 'present');
  assert.equal(r.earlyExitForgiven, true);
});

test('early exit beyond quota (prior 1 of 1) → stays half_day', () => {
  const b = { status: 'half_day', isLate: false };
  const r = applyAllowance(b, { isFlexiLateIn: false, isEarlyExit: true }, { policy, priorFlexi: 0, priorEarlyExit: 1 });
  assert.equal(r.status, 'half_day');
  assert.equal(r.earlyExitForgiven, false);
});

test('early exit disabled (quota 0) → stays half_day', () => {
  const b = { status: 'half_day', isLate: false };
  const r = applyAllowance(b, { isFlexiLateIn: false, isEarlyExit: true }, { policy: { ...policy, earlyExitsPerMonth: 0 }, priorFlexi: 0, priorEarlyExit: 0 });
  assert.equal(r.status, 'half_day');
});

// ── end-to-end: classify + apply chained ──
test('e2e: 4th late-in of month → half_day', () => {
  const inn = '10:45', out = '19:45';
  const b = base(inn, out);
  const c = classifyDay(b, IST(inn), IST(out), policy, dateRef, 'Asia/Kolkata');
  const r = applyAllowance(b, c, { policy, priorFlexi: 3, priorEarlyExit: 0 });
  assert.equal(r.status, 'half_day');
});

test('e2e: 1st early-exit of month → present (forgiven)', () => {
  const inn = '10:00', out = '16:00';
  const b = base(inn, out);
  assert.equal(b.status, 'half_day');
  const c = classifyDay(b, IST(inn), IST(out), policy, dateRef, 'Asia/Kolkata');
  const r = applyAllowance(b, c, { policy, priorFlexi: 0, priorEarlyExit: 0 });
  assert.equal(r.status, 'present');
});
