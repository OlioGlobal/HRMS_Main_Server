const Plan               = require('../../models/Plan');
const TenantSubscription = require('../../models/TenantSubscription');
const AppError           = require('../../utils/AppError');
const slugify            = require('../../utils/slugify');

// Fields a client is allowed to set on create/update.
const EDITABLE_FIELDS = [
  'name', 'description', 'price', 'currency',
  'billingCycle', 'maxEmployees', 'features', 'isActive',
];

const pick = (source, keys) =>
  keys.reduce((acc, key) => {
    if (source[key] !== undefined) acc[key] = source[key];
    return acc;
  }, {});

// ─── List ─────────────────────────────────────────────────────────────────────
const listPlans = async ({ active } = {}) => {
  const filter = {};
  if (active === 'true') filter.isActive = true;
  return Plan.find(filter).sort({ createdAt: -1 });
};

// ─── Get one ───────────────────────────────────────────────────────────────────
const getPlan = async (id) => {
  const plan = await Plan.findById(id);
  if (!plan) throw new AppError('Plan not found.', 404);
  return plan;
};

// ─── Create ────────────────────────────────────────────────────────────────────
const createPlan = async (payload) => {
  const data = pick(payload, EDITABLE_FIELDS);
  const slug = slugify(data.name);

  const clash = await Plan.findOne({ $or: [{ name: data.name }, { slug }] });
  if (clash) throw new AppError('A plan with this name already exists.', 409);

  data.slug = slug;
  return Plan.create(data);
};

// ─── Update ────────────────────────────────────────────────────────────────────
const updatePlan = async (id, payload) => {
  const plan = await Plan.findById(id);
  if (!plan) throw new AppError('Plan not found.', 404);

  const data = pick(payload, EDITABLE_FIELDS);

  // If the name changes, regenerate the slug and re-check uniqueness.
  if (data.name !== undefined && data.name !== plan.name) {
    const slug = slugify(data.name);
    const clash = await Plan.findOne({
      _id: { $ne: id },
      $or: [{ name: data.name }, { slug }],
    });
    if (clash) throw new AppError('A plan with this name already exists.', 409);
    data.slug = slug;
  }

  Object.assign(plan, data);
  await plan.save();
  return plan;
};

// ─── Delete ────────────────────────────────────────────────────────────────────
const deletePlan = async (id) => {
  const plan = await Plan.findById(id);
  if (!plan) throw new AppError('Plan not found.', 404);
  if (plan.isSystem) throw new AppError('System plans cannot be deleted.', 409);

  const inUse = await TenantSubscription.countDocuments({ plan_id: id });
  if (inUse > 0) {
    throw new AppError(`Cannot delete: ${inUse} companies are on this plan.`, 409);
  }

  await plan.deleteOne();
};

module.exports = { listPlans, getPlan, createPlan, updatePlan, deletePlan };
