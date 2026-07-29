const Plan    = require('../models/Plan');
const slugify = require('../utils/slugify');
const logger  = require('../utils/logger');

// The "Legacy" plan is a system plan used to grandfather companies that existed
// before subscription management was introduced. It cannot be deleted.
const DEFAULT_PLANS = [
  {
    name: 'Legacy', description: 'Grandfathered access for pre-existing companies.',
    price: 0, billingCycle: 'custom', maxEmployees: null,
    features: ['All modules', 'Unlimited employees', 'Grandfathered access'],
    isSystem: true,
  },
  {
    name: 'Starter', description: 'For small teams getting started.',
    price: 49, billingCycle: 'monthly', maxEmployees: 25,
    features: ['Up to 25 employees', 'Core HR modules', 'Email support'],
  },
  {
    name: 'Professional', description: 'For growing companies.',
    price: 149, billingCycle: 'monthly', maxEmployees: 100,
    features: ['Up to 100 employees', 'All modules', 'Priority support'],
  },
  {
    name: 'Enterprise', description: 'For large organisations.',
    price: 499, billingCycle: 'monthly', maxEmployees: null,
    features: ['Unlimited employees', 'All modules', 'Dedicated support'],
  },
];

/**
 * Seeds the default plans (idempotent by slug). Returns the Legacy plan doc.
 */
const seedDefaultPlans = async () => {
  let legacy = null;

  for (const p of DEFAULT_PLANS) {
    const slug = slugify(p.name);
    let plan = await Plan.findOne({ slug });
    if (!plan) {
      plan = await Plan.create({ ...p, slug });
      logger.info(`[Seeder] Plan created: ${p.name}`);
    }
    if (slug === 'legacy') legacy = plan;
  }

  return legacy;
};

module.exports = { seedDefaultPlans };
