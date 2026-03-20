const mongoose = require('mongoose');

const LEAVE_KINDS  = ['paid', 'unpaid', 'comp_off'];
const RESET_CYCLES = ['fiscal_year', 'calendar_year', 'monthly', 'none'];
const GENDERS      = ['all', 'male', 'female'];

const leaveTypeSchema = new mongoose.Schema(
  {
    company_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Leave type name is required'],
      trim: true,
      maxlength: [100, 'Max 100 characters'],
    },
    code: {
      type: String,
      required: [true, 'Leave type code is required'],
      trim: true,
      uppercase: true,
      maxlength: [10, 'Max 10 characters'],
    },
    type: {
      type: String,
      enum: LEAVE_KINDS,
      default: 'paid',
    },
    daysPerYear: {
      type: Number,
      required: true,
      min: 0,
    },
    resetCycle: {
      type: String,
      enum: RESET_CYCLES,
      default: 'fiscal_year',
    },
    carryForward: {
      type: Boolean,
      default: false,
    },
    maxCarryForwardDays: {
      type: Number,
      default: 0,
      min: 0,
    },
    proRateForNewJoiners: {
      type: Boolean,
      default: false,
    },
    applicableGender: {
      type: String,
      enum: GENDERS,
      default: 'all',
    },
    requiresDocument: {
      type: Boolean,
      default: false,
    },
    minDaysNotice: {
      type: Number,
      default: 0,
      min: 0,
    },
    maxDaysAtOnce: {
      type: Number,
      default: 365,
      min: 1,
    },
    allowHalfDay: {
      type: Boolean,
      default: true,
    },
    countWeekends: {
      type: Boolean,
      default: false,
    },
    countHolidays: {
      type: Boolean,
      default: false,
    },
    restrictDuringProbation: {
      type: Boolean,
      default: false,
    },
    restrictDuringNotice: {
      type: Boolean,
      default: false,
    },
    autoApproveDays: {
      type: Number,
      default: null,
      min: 1,
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

leaveTypeSchema.index({ company_id: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('LeaveType', leaveTypeSchema);
module.exports.LEAVE_KINDS  = LEAVE_KINDS;
module.exports.RESET_CYCLES = RESET_CYCLES;
module.exports.GENDERS      = GENDERS;
