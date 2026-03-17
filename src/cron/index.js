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

  console.log('[Cron] All cron jobs registered.');
};

module.exports = { registerCronJobs };
