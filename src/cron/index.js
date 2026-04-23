/**
 * Cron Registry
 *
 * Registers and starts all cron jobs.
 * Add new jobs here as the system grows (leave reset, rule engine, payroll, etc.)
 *
 * Structure:
 *   cron/
 *   ├── index.js        ← this file (registry)
 *   ├── runner.js        ← generic runner with error handling
 *   └── jobs/
 *       ├── autoAbsent.job.js
 *       └── (future jobs...)
 */

const cron = require('node-cron');
const { runJob } = require('./runner');

const autoAbsentJob     = require('./jobs/autoAbsent.job');
const documentExpiryJob = require('./jobs/documentExpiry.job');
const leaveResetJob     = require('./jobs/leaveReset.job');

const registerCronJobs = () => {
  // ─── Auto-Absent: every hour at minute 0 ────────────────────────────────────
  // Checks each timezone — only processes locations where it's 11 PM local time
  cron.schedule('0 * * * *', () => {
    runJob('auto-absent', autoAbsentJob.run);
  }, { runOnInit: false });

  // ─── Document Expiry: daily at midnight UTC ────────────────────────────────
  cron.schedule('0 0 * * *', () => {
    runJob('document-expiry', documentExpiryJob.run);
  }, { runOnInit: false });

  // ─── Leave Balance Reset: daily at 00:05 UTC ──────────────────────────────
  // 5-min offset avoids collision with document-expiry job.
  // DB-driven: checks if current year's balances exist → resets only when needed.
  // Server-down safe: catches up on next run automatically.
  cron.schedule('5 0 * * *', () => {
    runJob('leave-reset', leaveResetJob.run);
  }, { runOnInit: false });

  console.log('[Cron] All cron jobs registered.');
};

module.exports = { registerCronJobs };
