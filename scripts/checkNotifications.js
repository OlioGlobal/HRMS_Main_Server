/**
 * Diagnostic for birthday / work-anniversary / holiday notifications.
 *
 * Run from the backend/ folder on the server:
 *   node scripts/checkNotifications.js                         # read-only health report
 *   node scripts/checkNotifications.js --run birthday-wishes   # force-fire NOW (bypasses daily dedup, sends real emails)
 *   node scripts/checkNotifications.js --run holiday-reminder <companyId>
 *
 * Slugs: birthday-wishes | work-anniversary | holiday-reminder
 *
 * Loads .env (same file server.js uses). To point at another env file:
 *   DOTENV_CONFIG_PATH=.env.production node -r dotenv/config scripts/checkNotifications.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

const Company          = require('../src/models/Company');
const NotificationRule = require('../src/models/NotificationRule');
const RuleExecution    = require('../src/models/RuleExecution');
const registry         = require('../src/services/ruleEngine/registry');
const { executeRule }  = require('../src/services/ruleEngine/ruleEngine');

const SLUGS = ['birthday-wishes', 'work-anniversary', 'holiday-reminder'];
const mask = (uri = '') => uri.replace(/\/\/([^:]+):[^@]+@/, '//$1:****@');
const iso  = (d) => (d ? new Date(d).toISOString().replace('T', ' ').slice(0, 19) : 'never');

/** Confirm Redis is up and the hourly BullMQ cron is actually registered. */
async function checkRedis() {
  try {
    const { connection, notificationQueue } = require('../src/utils/queue');
    const pong = await connection.ping();
    const repeatables = await notificationQueue.getRepeatableJobs();
    const cronAll = repeatables.find((r) => r.name === 'cron:all');
    console.log(`Redis:            ${pong === 'PONG' ? 'UP' : 'unexpected (' + pong + ')'}`);
    console.log(`Repeatable jobs:  ${repeatables.map((r) => r.name).join(', ') || '(NONE — worker never registered them!)'}`);
    console.log(`cron:all next:    ${cronAll ? iso(cronAll.next) + ' UTC' : 'NOT REGISTERED — cron notifications will not fire'}`);
    return connection;
  } catch (e) {
    console.log(`Redis:            DOWN (${e.message})`);
    console.log('                  BullMQ cron cannot run without Redis — no cron notifications will fire.');
    return null;
  }
}

async function report() {
  const companies = await Company.find({}).select('name').sort({ name: 1 }).lean();
  for (const co of companies) {
    console.log(`\n=== ${co.name} (${co._id}) ===`);
    for (const slug of SLUGS) {
      const rule = await NotificationRule.findOne({ company_id: co._id, slug }).lean();
      if (!rule) {
        console.log(`  ${slug.padEnd(18)} RULE MISSING (not seeded for this company)`);
        continue;
      }
      const ch = Object.entries(rule.channels || {}).filter(([, v]) => v).map(([k]) => k).join('+') || 'none';
      console.log(`  ${slug.padEnd(18)} enabled=${rule.isEnabled ? 'YES' : 'NO '}  channels=${ch}  lastRun=${iso(rule.lastRunAt)}`);

      // Read-only dry run: how many recipients would fire today?
      try {
        const recips = await registry[slug].findRecipients(co._id.toString(), {}, rule.config || {});
        console.log(`  ${' '.repeat(18)} would-fire-today: ${recips.length} recipient(s)`);
      } catch (e) {
        console.log(`  ${' '.repeat(18)} dry-run ERROR: ${e.message}`);
      }

      // Last 3 real executions (what the hourly cron actually did)
      const execs = await RuleExecution.find({ company_id: co._id, ruleSlug: slug })
        .sort({ triggeredAt: -1 }).limit(3).lean();
      if (!execs.length) {
        console.log(`  ${' '.repeat(18)} last runs: none logged yet`);
      }
      for (const e of execs) {
        const emails = `${e.emailsSent}/${e.emailsSent + e.emailsFailed}`;
        console.log(`  ${' '.repeat(18)} ${iso(e.triggeredAt)}  ${e.status.padEnd(7)} notif=${e.notificationsCreated} emails=${emails}${e.error ? '  ERR=' + e.error : ''}`);
      }
    }
  }
}

async function forceRun(slug, companyArg) {
  if (!SLUGS.includes(slug)) {
    console.log(`\n--run slug must be one of: ${SLUGS.join(', ')}`);
    return;
  }
  const cos = companyArg
    ? [{ _id: companyArg, name: companyArg }]
    : await Company.find({}).select('name').lean();
  console.log(`\n>>> Force-running "${slug}" for ${cos.length} company(ies). Dedup bypassed; real emails will be sent.\n`);
  for (const co of cos) {
    try {
      const stats = await executeRule(co._id.toString(), slug, { _skipDedup: true });
      console.log(`  ${(co.name || co._id).toString().padEnd(28)} ${JSON.stringify(stats)}`);
    } catch (e) {
      console.log(`  ${(co.name || co._id).toString().padEnd(28)} ERROR: ${e.message}`);
    }
  }
}

(async () => {
  console.log(`Mongo URI:        ${mask(process.env.MONGO_URI || '(unset!)')}`);
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Mongo:            connected, db=${mongoose.connection.name}`);
  console.log(`Email config:     ${process.env.EMAIL_HOST && process.env.EMAIL_USER
    ? 'set (' + process.env.EMAIL_USER + ')'
    : 'MISSING — email channel will silently no-op'}`);

  const conn = await checkRedis();

  const runIdx = process.argv.indexOf('--run');
  if (runIdx !== -1) {
    await forceRun(process.argv[runIdx + 1], process.argv[runIdx + 2]);
  } else {
    await report();
    console.log('\nTip: to test end-to-end now, run:  node scripts/checkNotifications.js --run birthday-wishes');
  }

  await mongoose.disconnect();
  if (conn) await conn.quit();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
