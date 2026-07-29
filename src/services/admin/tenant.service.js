const Company               = require('../../models/Company');
const TenantSubscription    = require('../../models/TenantSubscription');
const Plan                  = require('../../models/Plan');
const PlanAssignmentHistory = require('../../models/PlanAssignmentHistory');
const Employee              = require('../../models/Employee');
const User                  = require('../../models/User');
const AppError              = require('../../utils/AppError');
const { computeTenantStatus, daysUntilExpiry } = require('./tenantStatus');
const tenantExpiry          = require('./tenantExpiry.service');

// ─── List all tenants ───────────────────────────────────────────────────────────
const listTenants = async ({ status, search } = {}) => {
  const [companies, subs, empCounts] = await Promise.all([
    Company.find().sort({ createdAt: -1 }).lean(),
    TenantSubscription.find().lean(),
    Employee.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: '$company_id', c: { $sum: 1 } } },
    ]),
  ]);

  const subMap = new Map(subs.map((s) => [String(s.company_id), s]));
  const empMap = new Map(empCounts.map((e) => [String(e._id), e.c]));

  let tenants = companies.map((company) => {
    const sub = subMap.get(String(company._id)) || null;
    return {
      _id:                company._id,
      name:               company.name,
      email:              company.email,
      slug:               company.slug,
      isActive:           company.isActive,
      createdAt:          company.createdAt,
      plan:               sub ? (sub.planNameSnapshot || null) : null,
      subscriptionStatus: sub ? sub.status : null,
      startDate:          sub ? sub.startDate : null,
      expiryDate:         sub ? sub.expiryDate : null,
      daysUntilExpiry:    daysUntilExpiry(sub),
      status:             computeTenantStatus(company, sub),
      employeeCount:      empMap.get(String(company._id)) || 0,
    };
  });

  if (status) {
    tenants = tenants.filter((t) => t.status === status);
  }

  if (search) {
    const rx = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    tenants = tenants.filter((t) => rx.test(t.name || '') || rx.test(t.email || ''));
  }

  return tenants;
};

// ─── Tenant detail ──────────────────────────────────────────────────────────────
const getTenant = async (id) => {
  const company = await Company.findById(id).lean();
  if (!company) throw new AppError('Tenant not found.', 404);

  const sub = await TenantSubscription.findOne({ company_id: id })
    .populate('plan_id')
    .lean();

  const status  = computeTenantStatus(company, sub);
  const days    = daysUntilExpiry(sub);

  const [totalEmployees, activeEmployees, users, history] = await Promise.all([
    Employee.countDocuments({ company_id: id }),
    Employee.countDocuments({ company_id: id, status: 'active' }),
    User.countDocuments({ company_id: id }),
    PlanAssignmentHistory.find({ company_id: id })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('performedBy', 'name email')
      .lean(),
  ]);

  const planName = sub ? (sub.planNameSnapshot || sub.plan_id?.name || null) : null;

  const tenant = {
    ...company,
    subscription:    sub,
    status,
    daysUntilExpiry: days,
  };

  const analytics = {
    totalEmployees,
    activeEmployees,
    users,
    status,
    plan:            planName,
    expiryDate:      sub ? sub.expiryDate : null,
    daysUntilExpiry: days,
  };

  return { tenant, analytics, history };
};

// ─── Assign / change / renew a plan ──────────────────────────────────────────────
const assignPlan = async (id, { planId, startDate, expiryDate, note }, adminId) => {
  const company = await Company.findById(id);
  if (!company) throw new AppError('Tenant not found.', 404);

  const plan = await Plan.findById(planId);
  if (!plan) throw new AppError('Plan not found.', 404);

  const start  = startDate ? new Date(startDate) : new Date();
  const expiry = expiryDate ? new Date(expiryDate) : null;

  const prior = await TenantSubscription.findOne({ company_id: id });

  let action;
  if (!prior)                                        action = 'assigned';
  else if (String(prior.plan_id) !== String(planId)) action = 'changed';
  else                                               action = 'renewed';

  const subscription = await TenantSubscription.findOneAndUpdate(
    { company_id: id },
    {
      company_id:       id,
      plan_id:          plan._id,
      planNameSnapshot: plan.name,
      startDate:        start,
      expiryDate:       expiry,
      status:           'active',
      assignedBy:       adminId,
      note:             note || '',
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  company.isActive = true;
  await company.save();

  await PlanAssignmentHistory.create({
    company_id:       id,
    plan_id:          plan._id,
    planNameSnapshot: plan.name,
    action,
    startDate:        start,
    expiryDate:       expiry,
    performedBy:      adminId,
    note:             note || '',
  });

  await tenantExpiry.scheduleExpiry(id, expiry || null);

  return { subscription, status: 'active' };
};

// ─── Deactivate ──────────────────────────────────────────────────────────────────
const deactivateTenant = async (id, adminId) => {
  const company = await Company.findById(id);
  if (!company) throw new AppError('Tenant not found.', 404);

  company.isActive = false;
  await company.save();

  const sub = await TenantSubscription.findOne({ company_id: id });

  await PlanAssignmentHistory.create({
    company_id:       id,
    plan_id:          sub ? sub.plan_id : null,
    planNameSnapshot: sub ? sub.planNameSnapshot : '',
    action:           'deactivated',
    startDate:        sub ? sub.startDate : null,
    expiryDate:       sub ? sub.expiryDate : null,
    performedBy:      adminId,
    note:             '',
  });

  await tenantExpiry.cancelExpiry(id);
};

// ─── Activate ────────────────────────────────────────────────────────────────────
const activateTenant = async (id, adminId) => {
  const company = await Company.findById(id);
  if (!company) throw new AppError('Tenant not found.', 404);

  const sub = await TenantSubscription.findOne({ company_id: id });

  // Guard: subscription is expired with a past expiry — don't silently reactivate it.
  if (sub && sub.status === 'expired' && sub.expiryDate && new Date(sub.expiryDate).getTime() <= Date.now()) {
    throw new AppError('Subscription has expired. Please assign or renew a plan instead.', 400);
  }

  company.isActive = true;
  await company.save();

  // Reactivate a non-active subscription if it still has runway (lifetime or future expiry).
  if (sub && sub.status !== 'active' && (!sub.expiryDate || new Date(sub.expiryDate).getTime() > Date.now())) {
    sub.status = 'active';
    await sub.save();
    await tenantExpiry.scheduleExpiry(id, sub.expiryDate || null);
  }

  await PlanAssignmentHistory.create({
    company_id:       id,
    plan_id:          sub ? sub.plan_id : null,
    planNameSnapshot: sub ? sub.planNameSnapshot : '',
    action:           'activated',
    startDate:        sub ? sub.startDate : null,
    expiryDate:       sub ? sub.expiryDate : null,
    performedBy:      adminId,
    note:             '',
  });
};

// ─── Full history ────────────────────────────────────────────────────────────────
const getHistory = async (id) => {
  const company = await Company.findById(id).lean();
  if (!company) throw new AppError('Tenant not found.', 404);

  return PlanAssignmentHistory.find({ company_id: id })
    .sort({ createdAt: -1 })
    .populate('performedBy', 'name email')
    .lean();
};

module.exports = {
  listTenants,
  getTenant,
  assignPlan,
  deactivateTenant,
  activateTenant,
  getHistory,
};
