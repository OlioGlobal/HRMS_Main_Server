const mongoose = require('mongoose');
const { Schema } = mongoose;

const ruleExecutionSchema = new Schema(
  {
    company_id: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    rule_id: {
      type: Schema.Types.ObjectId,
      ref: 'NotificationRule',
      required: true,
    },
    ruleSlug: {
      type: String,
      required: true,
    },
    triggeredAt: {
      type: Date,
      default: Date.now,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    durationMs: {
      type: Number,
      default: null,
    },
    status: {
      type: String,
      enum: ['success', 'partial', 'failed'],
      default: 'success',
    },
    notificationsCreated: {
      type: Number,
      default: 0,
    },
    emailsSent: {
      type: Number,
      default: 0,
    },
    emailsFailed: {
      type: Number,
      default: 0,
    },
    error: {
      type: String,
      default: null,
    },
    details: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: true }
);

ruleExecutionSchema.index({ company_id: 1, ruleSlug: 1, triggeredAt: -1 });
ruleExecutionSchema.index({ triggeredAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('RuleExecution', ruleExecutionSchema);
