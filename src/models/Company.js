const mongoose = require('mongoose');

const companySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Company name is required'],
      trim: true,
      maxlength: [100, 'Max 100 characters'],
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Company email is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone:   { type: String, default: null },
    website: { type: String, default: null },
    logo:    { type: String, default: null },
    llpin:   { type: String, default: null },
    gstin:   { type: String, default: null },
    address: { type: String, default: null },
    city:    { type: String, default: null },
    state:   { type: String, default: null },
    pincode: { type: String, default: null },
    plan: {
      type: String,
      enum: ['free', 'starter', 'professional', 'enterprise'],
      default: 'free',
    },
    settings: {
      timezone:        { type: String, default: 'UTC' },
      currency:        { type: String, default: 'USD' },
      dateFormat:      { type: String, default: 'YYYY-MM-DD' },
      timeFormat:      { type: String, enum: ['12h', '24h'], default: '24h' },
      fiscalYearStart: { type: Number, min: 1, max: 12, default: 1 }, // 1=Jan, 4=Apr
      workWeek: {
        type: [String],
        default: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
      },
      defaultProbationDays: { type: Number, default: 90, min: 0, max: 730 },
      geofencing: {
        enabled:       { type: Boolean, default: false },
        defaultRadius: { type: Number, default: 100 },  // metres
      },
      // ─── Leave settings ───────────────────────────────────────────────────
      leave: {
        resetCycle:           { type: String, enum: ['fiscal_year', 'calendar_year'], default: 'fiscal_year' },
        proRateNewJoiners:    { type: Boolean, default: true },
        proRateMethod:        { type: String, enum: ['monthly', 'daily'], default: 'monthly' },
        optionalHolidayCount: { type: Number, default: 2, min: 0 },
        weekendDays:          { type: [String], enum: ['MON','TUE','WED','THU','FRI','SAT','SUN'], default: ['SAT','SUN'] },
        lastResetDate:        { type: Date, default: null },
        nextResetDate:        { type: Date, default: null },
      },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Company', companySchema);
