// Shared derivation of a tenant's effective lifecycle status from its Company
// (isActive) + TenantSubscription. Used by both the tenants and analytics modules
// so they never disagree.
//
// Statuses:
//   active      — company active + subscription active
//   pending     — company deactivated + NO subscription (just registered)
//   deactivated — company deactivated (manually) or subscription cancelled
//   expired     — subscription past its expiry date

const computeTenantStatus = (company, sub) => {
  if (!sub) return company?.isActive ? 'active' : 'pending';
  if (sub.status === 'expired')   return 'expired';
  if (sub.status === 'cancelled') return 'deactivated';
  return company?.isActive ? 'active' : 'deactivated';
};

/** Whole days until a subscription expires. null if lifetime/no subscription. Negative if past. */
const daysUntilExpiry = (sub) => {
  if (!sub || !sub.expiryDate) return null;
  const ms = new Date(sub.expiryDate).getTime() - Date.now();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
};

module.exports = { computeTenantStatus, daysUntilExpiry };
