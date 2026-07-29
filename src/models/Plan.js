const mongoose = require('mongoose');

// A reusable subscription plan definition, created by the platform Super Admin
// and assigned to tenant companies via TenantSubscription.
const planSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Plan name is required'],
      unique: true,
      trim: true,
      maxlength: [60, 'Max 60 characters'],
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    description: { type: String, default: '', trim: true, maxlength: 500 },
    price:       { type: Number, default: 0, min: 0 },
    currency:    { type: String, default: 'USD', trim: true },
    billingCycle: {
      type: String,
      enum: ['monthly', 'quarterly', 'yearly', 'custom'],
      default: 'monthly',
    },
    // null = unlimited employees
    maxEmployees: { type: Number, default: null, min: 0 },
    features:     { type: [String], default: [] },
    isActive:     { type: Boolean, default: true },
    // System plans (e.g. the auto-created "Legacy" plan) cannot be deleted.
    isSystem:     { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Plan', planSchema);
