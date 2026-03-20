/**
 * Registers repeatable BullMQ cron jobs and starts the worker
 * for processing both cron-based and event-based notification rules.
 *
 * Called from server.js after DB connect.
 */
const { notificationQueue, createWorker } = require('../../utils/queue');
const { executeRule } = require('./ruleEngine');
const Company = require('../../models/Company');
const NotificationRule = require('../../models/NotificationRule');

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
    // Clean up any stale repeatable jobs before registering
    const existing = await notificationQueue.getRepeatableJobs();
    for (const job of existing) {
      if (job.name === 'cron:all') {
        await notificationQueue.removeRepeatableByKey(job.key);
      }
    }

    // Register a single repeatable cron that fires every hour.
    // executeRule handles per-rule dedup (once per day), and the hourly cadence
    // gives timezone coverage for companies in different regions.
    await notificationQueue.add('cron:all', {}, {
      repeat: { cron: '0 * * * *' },
      removeOnComplete: { count: 24 },
      removeOnFail: { count: 10 },
    });

    // Start worker to process both cron and event jobs
    createWorker(async (job) => {
      if (job.name === 'cron:all') {
        await processCronRules();
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
