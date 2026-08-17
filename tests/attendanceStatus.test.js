/**
 * Exhaustive cases for calculateAttendanceStatus with the Olio time-config:
 *   shift 10:00–19:00, grace 30 (flexi to 10:30), late-after 60 (11:00),
 *   half-day-below 9h, absent-below 2h, OT after 9h,
 *   halfDayIfClockInAfter "11:00", ignoreHalfDayIfFullHours toggle.
 *
 * Pure function — no DB. Verifies timezone correctness (IST +5:30 and UTC) and
 * every boundary (10:00 / 10:30 / 11:00 / 11:01 / 11:15), half/absent/OT, and
 * the no-clock-out live status.
 */
const test   = require('node:test');
const assert = require('node:assert');
const { calculateAttendanceStatus } = require('../src/utils/calculateAttendanceStatus');

const DATE = '2026-08-18'; // a Tuesday
const [Y, M, D] = DATE.split('-').map(Number);
const dateRef = new Date(Date.UTC(Y, M - 1, D, 0, 0, 0)); // UTC midnight

// IST is a fixed +5:30 offset (no DST): UTC = wall-clock − 330 min.
const IST = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return new Date(Date.UTC(Y, M - 1, D, h, m) - 330 * 60000); };
const UTC = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return new Date(Date.UTC(Y, M - 1, D, h, m)); };

const basePolicy = {
  workStart: '10:00', workEnd: '19:00',
  graceMinutes: 30, lateMarkAfterMinutes: 60,
  halfDayThresholdHours: 9, absentThresholdHours: 2, overtimeThresholdHours: 9,
  halfDayIfClockInAfter: '11:00', ignoreHalfDayIfFullHours: false,
};
const P = (over = {}) => ({ ...basePolicy, ...over });

const run = (inn, out, policy, tz = 'Asia/Kolkata', mk = IST) =>
  calculateAttendanceStatus(inn && mk(inn), out && mk(out), policy, dateRef, tz);

// ─────────────────────────────── IST cases ───────────────────────────────

test('on-time full day → present, no OT', () => {
  const r = run('10:00', '19:00', P());
  assert.equal(r.status, 'present');
  assert.equal(r.isLate, false);
  assert.equal(r.totalHours, 9);
  assert.equal(r.overtimeHours, 0);
});

test('flexi arrival within grace (10:20) but completes 9h → present, not late', () => {
  const r = run('10:20', '19:20', P());
  assert.equal(r.status, 'present');
  assert.equal(r.isLate, false); // 20 ≤ grace 30
});

test('flexi arrival (10:20) but leaves at 19:00 → under 9h → half_day', () => {
  const r = run('10:20', '19:00', P());
  assert.equal(r.status, 'half_day'); // 8.67h < 9
});

test('late past grace but before 11:00 (10:45), full 9h → present but isLate flagged', () => {
  const r = run('10:45', '19:45', P());
  assert.equal(r.status, 'present');
  assert.equal(r.isLate, true);
  assert.equal(r.lateByMinutes, 45);
});

test('exactly 11:00 clock-in, 9h → present (boundary is inclusive of on-time)', () => {
  const r = run('11:00', '20:00', P());
  assert.equal(r.status, 'present'); // not strictly after cutoff, diff 60 not > 60
});

test('11:01 clock-in (just after cutoff), full 9h, ignore OFF → half_day', () => {
  const r = run('11:01', '20:01', P());
  assert.equal(r.status, 'half_day');
});

test('11:15 clock-in, completes 9h, ignore OFF → half_day (strict)', () => {
  const r = run('11:15', '20:15', P({ ignoreHalfDayIfFullHours: false }));
  assert.equal(r.status, 'half_day');
  assert.equal(r.isLate, true);
});

test('11:15 clock-in, completes 9h, ignore ON → late (full day, waived)', () => {
  const r = run('11:15', '20:15', P({ ignoreHalfDayIfFullHours: true }));
  assert.equal(r.status, 'late');
});

test('11:15 clock-in, only 7.75h, ignore ON → still half_day (full hours NOT done)', () => {
  const r = run('11:15', '19:00', P({ ignoreHalfDayIfFullHours: true }));
  assert.equal(r.status, 'half_day');
});

test('after cutoff but worked < absent threshold → absent wins over half_day', () => {
  const r = run('11:15', '12:00', P());
  assert.equal(r.status, 'absent'); // 0.75h < 2
});

test('on-time but short hours (1.5h) → absent', () => {
  const r = run('10:00', '11:30', P());
  assert.equal(r.status, 'absent');
});

test('overtime: 10h worked → present + 1h OT', () => {
  const r = run('10:00', '20:00', P());
  assert.equal(r.status, 'present');
  assert.equal(r.overtimeHours, 1);
});

test('cutoff disabled (null): 11:15 + 9h → late (legacy behavior, no forced half_day)', () => {
  const r = run('11:15', '20:15', P({ halfDayIfClockInAfter: null }));
  assert.equal(r.status, 'late');
});

// ─────────────────────── no clock-out (live status) ───────────────────────

test('no clock-out, on time → present', () => {
  const r = run('10:00', null, P());
  assert.equal(r.status, 'present');
});

test('no clock-out, late 10:45 (≤ lateAfter 60) → present, isLate', () => {
  const r = run('10:45', null, P());
  assert.equal(r.status, 'present');
  assert.equal(r.isLate, true);
});

test('no clock-out, after cutoff 11:15, ignore OFF → half_day locked in', () => {
  const r = run('11:15', null, P({ ignoreHalfDayIfFullHours: false }));
  assert.equal(r.status, 'half_day');
});

test('no clock-out, after cutoff 11:15, ignore ON → late (can still be rescued by hours)', () => {
  const r = run('11:15', null, P({ ignoreHalfDayIfFullHours: true }));
  assert.equal(r.status, 'late');
});

test('no clock-in at all → absent', () => {
  const r = calculateAttendanceStatus(null, null, P(), dateRef, 'Asia/Kolkata');
  assert.equal(r.status, 'absent');
});

// ─────────────────────────────── UTC cases ───────────────────────────────
// Same rules must hold when the employee tz is UTC (different absolute instants).

test('[UTC] on-time 10:00 + 9h → present', () => {
  const r = run('10:00', '19:00', P(), 'UTC', UTC);
  assert.equal(r.status, 'present');
  assert.equal(r.totalHours, 9);
});

test('[UTC] 11:15 + 9h, ignore OFF → half_day', () => {
  const r = run('11:15', '20:15', P(), 'UTC', UTC);
  assert.equal(r.status, 'half_day');
});

test('[UTC] 11:15 + 9h, ignore ON → late', () => {
  const r = run('11:15', '20:15', P({ ignoreHalfDayIfFullHours: true }), 'UTC', UTC);
  assert.equal(r.status, 'late');
});

test('[UTC] exactly 11:00 + 9h → present (boundary)', () => {
  const r = run('11:00', '20:00', P(), 'UTC', UTC);
  assert.equal(r.status, 'present');
});
