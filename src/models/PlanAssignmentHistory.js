const mongoose = require('mongoose');

// Immutable audit log of every plan/subscription action for a company.
const planAssignmentHistorySchema = new mongoose.Schema(
  {
    company_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    plan_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plan',
      default: null,
    },
    planNameSnapshot: { type: String, default: '' },
    action: {
      type: String,
      enum: ['assigned', 'changed', 'renewed', 'cancelled', 'expired', 'activated', 'deactivated'],
      required: true,
    },
    startDate:  { type: Date, default: null },
    expiryDate: { type: Date, default: null },
    // null = performed by the system (e.g. automatic expiry job)
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PlatformUser',
      default: null,
    },
    note: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PlanAssignmentHistory', planAssignmentHistorySchema);
