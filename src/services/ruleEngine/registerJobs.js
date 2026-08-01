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
const { getLocalHour, buildLocationTZMap } = require('./handlers/helpers');

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
 * Employee-facing greeting rules whose send time must follow each recipient's
 * OWN location timezone (not the company's). These run every hour with the daily
 * dedup skipped; the handler includes only employees whose local hour == runTime,
 * so each person is greeted once, at their local run time, even across locations.
 */
const PER_LOCATION_SLUGS = new Set([
  'birthday-wishes',
  'work-anniversary',
  'holiday-reminder',
]);

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
 *
 * The master job ticks hourly, but each rule has a configured runTime (e.g. "09:00").
 *
 *  • Per-location greeting rules (birthday, anniversary, holiday) run every hour with
 *    the daily dedup skipped — the handler filters recipients to those whose OWN
 *    location-local hour matches runTime, so each person is greeted once at their
 *    local time regardless of which office/timezone they're in. We only bother running
 *    when at least one relevant timezone is currently at the run hour.
 *  • All other cron rules fire once per day, gated on the company-local run hour, with
 *    the RuleExecution dedup as a second safety net against re-runs.
 */
const processCronRules = async () => {
  let companies;
  try {
    companies = await Company.find({}).select('_id settings.timezone').lean();
  } catch (err) {
    console.error('[RuleEngine] Failed to fetch companies for cron processing:', err.message);
    return;
  }

  if (!companies || companies.length === 0) return;

  for (const company of companies) {
    const companyId = company._id.toString();
    const companyTZ = company.settings?.timezone || 'UTC';
    const companyLocalHour = getLocalHour(companyTZ);

    // Fetch enabled cron rules for this company in one query to avoid unnecessary work
    let ruleConfigs; // slug -> { runHour, consolidate }
    try {
      const enabledRules = await NotificationRule.find({
        company_id: company._id,
        triggerType: 'cron',
        isEnabled: true,
        slug: { $in: CRON_SLUGS },
      })
        .select('slug config.runTime config.consolidateEmail')
        .lean();

      ruleConfigs = new Map(
        enabledRules.map((r) => {
          const rt = r.config?.runTime; // e.g. "09:00"
          const hour = typeof rt === 'string' && rt.includes(':')
            ? parseInt(rt.split(':')[0], 10)
            : null;
          return [r.slug, {
            runHour: Number.isNaN(hour) ? null : hour,
            consolidate: !!r.config?.consolidateEmail,
          }];
        })
      );
    } catch (err) {
      console.error(`[RuleEngine] Failed to fetch rules for company ${companyId}:`, err.message);
      continue;
    }

    // The distinct local hours currently in effect across the company's timezones
    // (company default + every active location). Used to decide whether a per-location
    // greeting rule has anyone due right now, so we skip pointless hourly runs.
    let activeHours = new Set([companyLocalHour]);
    const needsLocationHours = [...ruleConfigs.entries()].some(
      ([s, c]) => PER_LOCATION_SLUGS.has(s) && !c.consolidate
    );
    if (needsLocationHours) {
      try {
        const locTZMap = await buildLocationTZMap(company._id, companyTZ);
        for (const tz of locTZMap.values()) activeHours.add(getLocalHour(tz));
      } catch (err) {
        console.error(`[RuleEngine] Failed to resolve location timezones for company ${companyId}:`, err.message);
      }
    }

    for (const slug of CRON_SLUGS) {
      // Skip if not enabled (avoids unnecessary handler calls)
      if (!ruleConfigs.has(slug)) continue;

      const { runHour, consolidate } = ruleConfigs.get(slug);
      // Per-location mode requires a concrete run hour AND per-recipient emails. When the
      // rule consolidates into one CC'd email, we can't stagger by local time — fall back
      // to the once-per-day company-gated path below.
      const perLocation = PER_LOCATION_SLUGS.has(slug) && runHour !== null && !consolidate;

      let contextData = {};
      if (perLocation) {
        // Run only when SOME timezone is at the run hour; the handler filters recipients
        // to those whose own location-local hour matches. Skip the daily dedup so it can
        // fire once per timezone across the day.
        if (!activeHours.has(runHour)) continue;
        contextData = { _skipDedup: true, _runHour: runHour };
      } else {
        // Honor the configured run time in the company timezone; fire once per day.
        // If no runTime is set, fall back to running every tick (dedup keeps it once/day).
        if (runHour !== null && runHour !== companyLocalHour) continue;
      }

      try {
        const result = await executeRule(companyId, slug, contextData);
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
