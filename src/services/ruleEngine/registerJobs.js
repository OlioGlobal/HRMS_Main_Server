/**
 * Registers repeatable BullMQ cron jobs and starts the worker
 * for processing both cron-based and event-based notification rules,
 * plus system cron jobs (auto-absent, document-expiry).
 *
 * Called from server.js after DB connect.
 */
const { notificationQueue, createWorker } = require('../../utils/queue');
const { executeRule } = require('./ruleEngine');
const Company = require('../../models/Company');
const NotificationRule = require('../../models/NotificationRule');
const autoAbsentJob = require('../../cron/jobs/autoAbsent.job');
const documentExpiryJob = require('../../cron/jobs/documentExpiry.job');

/** All cron-based rule slugs */
const CRON_SLUGS = [
  'probation-reminder',
  'birthday-wishes',
  'missed-clock-out',
  'document-expiry-alert',
  'appraisal-reminder',
  'onboarding-incomplete',
  'offboarding-approaching',
  'work-anniversary',
  'holiday-reminder',
  'leave-auto-approve',
];

/**
 * Process shift notifications (every 15 min) for all companies.
 * Unlike daily cron rules, shift notifications skip the daily dedup check.
 */
const processShiftNotifications = async () => {
  try {
    const companies = await Company.find({}).select('_id').lean();
    for (const company of companies) {
      try {
        // executeRule with skipDedup flag — shift notifications can fire multiple times per day
        await executeRule(company._id.toString(), 'shift-notification', { _skipDedup: true });
      } catch (err) {
        console.error(`[RuleEngine] shift-notification failed for company ${company._id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[RuleEngine] processShiftNotifications failed:', err.message);
  }
};

/**
 * Process all cron rules across all companies.
 * The dedup logic inside executeRule prevents running the same rule twice per day.
 */
const processCronRules = async () => {
  let companies;
  try {
    companies = await Company.find({}).select('_id').lean();
  } catch (err) {
    console.error('[RuleEngine] Failed to fetch companies for cron processing:', err.message);
    return;
  }

  if (!companies || companies.length === 0) return;

  for (const company of companies) {
    const companyId = company._id.toString();

    // Fetch enabled cron rules for this company in one query to avoid unnecessary work
    let enabledSlugs;
    try {
      const enabledRules = await NotificationRule.find({
        company_id: company._id,
        triggerType: 'cron',
        isEnabled: true,
        slug: { $in: CRON_SLUGS },
      })
        .select('slug')
        .lean();

      enabledSlugs = new Set(enabledRules.map((r) => r.slug));
    } catch (err) {
      console.error(`[RuleEngine] Failed to fetch rules for company ${companyId}:`, err.message);
      continue;
    }

    for (const slug of CRON_SLUGS) {
      // Skip if not enabled (avoids unnecessary handler calls)
      if (!enabledSlugs.has(slug)) continue;

      try {
        const result = await executeRule(companyId, slug, {});
        if (result.notificationsCreated > 0) {
          console.log(
            `[RuleEngine] Cron ${slug} for company ${companyId}: ` +
            `${result.notificationsCreated} notifications, ${result.emailsSent} emails`
          );
        }
      } catch (err) {
        console.error(`[RuleEngine] Cron ${slug} failed for company ${companyId}:`, err.message);
      }
    }
  }
};

/**
 * Register the master cron job and start the BullMQ worker.
 */
const registerNotificationJobs = async () => {
  try {
    // Clean up stale repeatable jobs before registering
    const existing = await notificationQueue.getRepeatableJobs();
    for (const job of existing) {
      await notificationQueue.removeRepeatableByKey(job.key);
    }

    // ── Notification rules cron: every hour ──
    await notificationQueue.add('cron:all', {}, {
      repeat: { cron: '0 * * * *' },
      removeOnComplete: { count: 24 },
      removeOnFail: { count: 10 },
    });

    // ── Auto-Absent: every hour (checks timezone, processes at 11 PM local) ──
    await notificationQueue.add('cron:auto-absent', {}, {
      repeat: { cron: '0 * * * *' },
      removeOnComplete: { count: 24 },
      removeOnFail: { count: 10 },
    });

    // ── Document Expiry: daily at midnight UTC ──
    await notificationQueue.add('cron:document-expiry', {}, {
      repeat: { cron: '0 0 * * *' },
      removeOnComplete: { count: 7 },
      removeOnFail: { count: 5 },
    });

    // ── Shift Notification: every 15 minutes ──
    await notificationQueue.add('cron:shift', {}, {
      repeat: { cron: '*/15 * * * *' },
      removeOnComplete: { count: 96 },
      removeOnFail: { count: 10 },
    });

    // Start worker to process all job types
    createWorker(async (job) => {
      if (job.name === 'cron:all') {
        await processCronRules();
      } else if (job.name === 'cron:shift') {
        await processShiftNotifications();
      } else if (job.name === 'cron:auto-absent') {
        await autoAbsentJob.run();
      } else if (job.name === 'cron:document-expiry') {
        await documentExpiryJob.run();
      } else if (job.name.startsWith('event:')) {
        const slug = job.name.replace('event:', '');
        const { companyId, ...contextData } = job.data;

        if (!companyId) {
          console.error(`[RuleEngine] Event job ${job.name} missing companyId`);
          return;
        }

        await executeRule(companyId, slug, contextData);
      } else {
        console.warn(`[RuleEngine] Unknown job name: ${job.name}`);
      }
    });

    console.log('[RuleEngine] BullMQ jobs registered + worker started');
  } catch (err) {
    console.error('[RuleEngine] Failed to register jobs:', err.message);
    throw err;
  }
};

module.exports = { registerNotificationJobs };
