const Company               = require('../models/Company');
const TenantSubscription    = require('../models/TenantSubscription');
const PlanAssignmentHistory = require('../models/PlanAssignmentHistory');
const Plan                  = require('../models/Plan');
const logger                = require('../utils/logger');

/**
 * One-time (idempotent) migration: every company that has NO subscription yet
 * is grandfathered onto the Legacy plan — kept active with lifetime access.
 * New companies created after this feature start deactivated (isActive: false)
 * with no subscription, until a Super Admin assigns a plan.
 */
const grandfatherTenants = async () => {
  const legacy = await Plan.findOne({ slug: 'legacy' });
  if (!legacy) {
    logger.warn('[Seeder] Legacy plan missing — skipping tenant grandfathering');
    return;
  }

  const companies = await Company.find({}, '_id name isActive').lean();
  let migrated = 0;

  for (const company of companies) {
    const existing = await TenantSubscription.findOne({ company_id: company._id }).select('_id').lean();
    if (existing) continue;

    await TenantSubscription.create({
      company_id:       company._id,
      plan_id:          legacy._id,
      planNameSnapshot: legacy.name,
      startDate:        new Date(),
      expiryDate:       null, // lifetime
      status:           'active',
      assignedBy:       null,
      note:             'Grandfathered on Legacy plan',
    });

    await PlanAssignmentHistory.create({
      company_id:       company._id,
      plan_id:          legacy._id,
      planNameSnapshot: legacy.name,
      action:           'assigned',
      startDate:        new Date(),
      expiryDate:       null,
      performedBy:      null,
      note:             'Grandfathered (existing company)',
    });

    // Ensure grandfathered companies stay active.
    if (!company.isActive) {
      await Company.findByIdAndUpdate(company._id, { isActive: true });
    }

    migrated += 1;
  }

  if (migrated) logger.info(`[Seeder] Grandfathered ${migrated} existing company(ies) onto Legacy plan`);
};

module.exports = { grandfatherTenants };
