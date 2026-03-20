const mongoose = require('mongoose');
const { Schema } = mongoose;

const notificationRuleSchema = new Schema(
  {
    company_id: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    slug: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    triggerType: {
      type: String,
      enum: ['cron', 'event'],
      required: true,
    },
    eventName: {
      type: String,
      default: null,
    },
    cronSchedule: {
      type: String,
      default: null,
    },
    isEnabled: {
      type: Boolean,
      default: true,
    },
    isSystem: {
      type: Boolean,
      default: true,
    },
    config: {
      daysBefore: { type: Number, default: null },
      daysAfter: { type: Number, default: null },
      runTime: { type: String, default: '09:00' },
      repeatIntervalDays: { type: Number, default: null },
      maxNotifications: { type: Number, default: null },
    },
    recipients: {
      employee: { type: Boolean, default: false },
      manager: { type: Boolean, default: false },
      hr: { type: Boolean, default: false },
      ccEmails: [{ type: String, trim: true }],
    },
    channels: {
      inApp: { type: Boolean, default: true },
      email: { type: Boolean, default: false },
    },
    templates: {
      inApp: {
        title: { type: String },
        body: { type: String },
      },
      email: {
        subject: { type: String },
        body: { type: String },
      },
    },
    lastRunAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

notificationRuleSchema.index({ company_id: 1, slug: 1 }, { unique: true });

module.exports = mongoose.model('NotificationRule', notificationRuleSchema);
