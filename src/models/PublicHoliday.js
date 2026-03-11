const mongoose = require('mongoose');

const TYPES = ['national', 'regional', 'company', 'optional'];

const publicHolidaySchema = new mongoose.Schema(
  {
    company_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    location_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Location',
      default: null, // null = company-wide
    },
    name: {
      type: String,
      required: [true, 'Holiday name is required'],
      trim: true,
      maxlength: [150, 'Max 150 characters'],
    },
    date: {
      type: Date,
      required: [true, 'Holiday date is required'],
    },
    year: {
      type: Number,
      required: true,
    },
    type: {
      type: String,
      enum: TYPES,
      default: 'national',
    },
    isOptional: {
      type: Boolean,
      default: false,
    },
    source: {
      type: String,
      enum: ['imported', 'manual'],
      default: 'manual',
    },
    description: {
      type: String,
      trim: true,
      maxlength: [300, 'Max 300 characters'],
      default: null,
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

publicHolidaySchema.index({ company_id: 1, date: 1, location_id: 1 }, { unique: true });
publicHolidaySchema.index({ company_id: 1, year: 1 });

module.exports = mongoose.model('PublicHoliday', publicHolidaySchema);
module.exports.TYPES = TYPES;
