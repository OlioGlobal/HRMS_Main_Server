const mongoose = require('mongoose');

// The CURRENT subscription for a company. Exactly one per company (unique company_id).
// Historical changes are recorded separately in PlanAssignmentHistory.
const tenantSubscriptionSchema = new mongoose.Schema(
  {
    company_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      unique: true,
      index: true,
    },
    plan_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plan',
      required: true,
    },
    // Denormalized so history/UI still make sense even if a plan is renamed/deleted.
    planNameSnapshot: { type: String, default: '' },
    startDate: { type: Date, default: () => new Date() },
    // null = lifetime / no expiry
    expiryDate: { type: Date, default: null },
    status: {
      type: String,
      enum: ['active', 'expired', 'cancelled'],
      default: 'active',
      index: true,
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PlatformUser',
      default: null,
    },
    note: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('TenantSubscription', tenantSubscriptionSchema);
