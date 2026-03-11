const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema(
  {
    company_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Location name is required'],
      trim: true,
      maxlength: [100, 'Max 100 characters'],
    },
    code: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: [10, 'Max 10 characters'],
      default: null,
    },
    country: {
      type: String,
      required: [true, 'Country is required'],
      trim: true,
    },
    city: {
      type: String,
      trim: true,
      default: null,
    },
    address: {
      type: String,
      trim: true,
      default: null,
    },
    isHQ: {
      type: Boolean,
      default: false,
    },

    // ─── Office Hours ──────────────────────────────────────────────────────────
    timezone:    { type: String, default: 'UTC' },
    workStart:   { type: String, default: '09:00' },  // "HH:mm"
    workEnd:     { type: String, default: '18:00' },  // "HH:mm"
    workingDays: {
      type: [String],
      enum: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
      default: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
    },

    // ─── Currency ──────────────────────────────────────────────────────────────
    currency: { type: String, default: 'USD' },

    // ─── Geofence ─────────────────────────────────────────────────────────────
    geofence: {
      lat:    { type: Number, default: null },
      lng:    { type: Number, default: null },
      radius: { type: Number, default: 100 },   // metres
    },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// One HQ per company
locationSchema.index({ company_id: 1, isHQ: 1 });
locationSchema.index({ company_id: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Location', locationSchema);
