const { expiryQueue, createExpiryWorker } = require('../../utils/expiryQueue');
const TenantSubscription    = require('../../models/TenantSubscription');
const Company               = require('../../models/Company');
const PlanAssignmentHistory = require('../../models/PlanAssignmentHistory');
const logger                = require('../../utils/logger');

// NOTE: BullMQ forbids ':' in custom job IDs (it's the internal Redis key
// separator) — use '-' as the separator.
const jobId = (companyId) => `expiry-${companyId}`;

/** Remove any pending expiry job for this company (safe if none exists). */
const cancelExpiry = async (companyId) => {
  try {
    await expiryQueue.remove(jobId(companyId));
  } catch (err) {
    logger.error('[Expiry] Failed to remove job', { companyId: String(companyId), error: err.message });
  }
};

/**
 * Schedule (or reschedule) the exact-time expiry job for a company.
 * Deterministic jobId → always exactly one job per tenant.
 * - expiryDate null  → lifetime, ensure no job exists.
 * - expiryDate past  → expire immediately.
 * - expiryDate future→ delayed job firing at that instant.
 */
const scheduleExpiry = async (companyId, expiryDate) => {
  await cancelExpiry(companyId); // replace any existing job

  if (!expiryDate) return; // lifetime — nothing to schedule

  const delay = new Date(expiryDate).getTime() - Date.now();
  if (delay <= 0) {
    await expireTenant(companyId, { reason: 'past-due-on-schedule' });
    return;
  }

  await expiryQueue.add(
    'expire',
    { companyId: String(companyId) },
    {
      delay,
      jobId: jobId(companyId),
      removeOnComplete: true,
      removeOnFail: { count: 20 },
    }
  );
};

/**
 * Lock a tenant whose subscription has expired. Idempotent + guarded against
 * stale jobs (won't fire if the expiry was pushed to the future in the meantime).
 */
const expireTenant = async (companyId, { reason = 'expiry' } = {}) => {
  const sub = await TenantSubscription.findOne({ company_id: companyId });
  if (!sub || sub.status !== 'active') return { skipped: true };

  // Lifetime subscription — never expire.
  if (!sub.expiryDate) return { skipped: true };

  // Stale job guard: expiry was extended after this job was queued.
  if (new Date(sub.expiryDate).getTime() > Date.now()) return { skipped: true };

  sub.status = 'expired';
  await sub.save();

  await Company.findByIdAndUpdate(companyId, { isActive: false });

  await PlanAssignmentHistory.create({
    company_id:       companyId,
    plan_id:          sub.plan_id,
    planNameSnapshot: sub.planNameSnapshot,
    action:           'expired',
    startDate:        sub.startDate,
    expiryDate:       sub.expiryDate,
    performedBy:      null, // system
    note:             `Auto-expired (${reason})`,
  });

  logger.info(`[Expiry] Tenant ${companyId} locked — subscription expired`);
  return { expired: true };
};

/**
 * Startup reconciliation (durability backstop):
 *  1. Expire any active subscription already past its expiry (missed job).
 *  2. Re-schedule exact-time jobs for active subscriptions with a future expiry
 *     (covers the case where Redis was flushed and delayed jobs were lost).
 */
const reconcile = async () => {
  const now = new Date();

  const overdue = await TenantSubscription.find({
    status: 'active',
    expiryDate: { $ne: null, $lte: now },
  }).select('company_id').lean();

  for (const sub of overdue) {
    await expireTenant(sub.company_id, { reason: 'reconcile' });
  }

  const upcoming = await TenantSubscription.find({
    status: 'active',
    expiryDate: { $ne: null, $gt: now },
  }).select('company_id expiryDate').lean();

  for (const sub of upcoming) {
    await scheduleExpiry(sub.company_id, sub.expiryDate);
  }

  logger.info(`[Expiry] Reconcile complete — expired ${overdue.length}, rescheduled ${upcoming.length}`);
};

/** Start the worker that processes exact-time expiry jobs, then reconcile. */
const startExpiryWorker = async () => {
  createExpiryWorker(async (job) => {
    if (job.name === 'expire') {
      await expireTenant(job.data.companyId, { reason: 'scheduled-job' });
    }
  });

  await reconcile();
  logger.info('[Expiry] Worker started + reconcile done');
};

module.exports = {
  scheduleExpiry,
  cancelExpiry,
  expireTenant,
  reconcile,
  startExpiryWorker,
};
