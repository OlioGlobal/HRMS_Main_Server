const Company            = require('../../models/Company');
const TenantSubscription = require('../../models/TenantSubscription');
const Employee           = require('../../models/Employee');
const { computeTenantStatus } = require('./tenantStatus');

// ─── Platform-wide stats ─────────────────────────────────────────────────────────
const getPlatformStats = async () => {
  const [companies, subs, totalEmployees, recentCompanies] = await Promise.all([
    Company.find().select('_id name isActive createdAt').lean(),
    TenantSubscription.find().select('company_id status expiryDate planNameSnapshot').lean(),
    Employee.countDocuments({ status: 'active' }),
    Company.find().sort({ createdAt: -1 }).limit(5).select('_id name isActive createdAt').lean(),
  ]);

  const subMap = new Map(subs.map((s) => [String(s.company_id), s]));

  // Status counts (computed in memory).
  const counts = { active: 0, pending: 0, deactivated: 0, expired: 0 };
  for (const company of companies) {
    const sub = subMap.get(String(company._id)) || null;
    const status = computeTenantStatus(company, sub);
    if (counts[status] !== undefined) counts[status] += 1;
  }

  // Expiring soon: active subscriptions expiring within the next 7 days.
  const now = Date.now();
  const in7d = now + 7 * 24 * 60 * 60 * 1000;
  const expiringSoon = subs.filter((s) => {
    if (s.status !== 'active' || !s.expiryDate) return false;
    const t = new Date(s.expiryDate).getTime();
    return t >= now && t <= in7d;
  }).length;

  // Plan distribution (tenants per plan, incl. a "No plan" bucket).
  const distMap = new Map();
  for (const company of companies) {
    const sub = subMap.get(String(company._id)) || null;
    const plan = sub ? (sub.planNameSnapshot || 'Unknown') : 'No plan';
    distMap.set(plan, (distMap.get(plan) || 0) + 1);
  }
  const planDistribution = Array.from(distMap.entries()).map(([plan, count]) => ({ plan, count }));

  // Recent signups with computed status.
  const recentSignups = recentCompanies.map((company) => {
    const sub = subMap.get(String(company._id)) || null;
    return {
      _id:       company._id,
      name:      company.name,
      createdAt: company.createdAt,
      status:    computeTenantStatus(company, sub),
    };
  });

  return {
    totalTenants:       companies.length,
    activeTenants:      counts.active,
    pendingTenants:     counts.pending,
    deactivatedTenants: counts.deactivated,
    expiredTenants:     counts.expired,
    expiringSoon,
    totalEmployees,
    planDistribution,
    recentSignups,
  };
};

module.exports = { getPlatformStats };
