const mongoose = require('mongoose');

const TYPES    = ['annual', 'half_yearly', 'quarterly'];
const STATUSES = ['draft', 'active', 'completed'];
const SCOPES   = ['all', 'department', 'custom'];

const appraisalCycleSchema = new mongoose.Schema(
  {
    company_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Cycle name is required'],
      trim: true,
      maxlength: [150, 'Max 150 characters'],
    },
    type: {
      type: String,
      enum: TYPES,
      required: [true, 'Cycle type is required'],
    },

    // Period being reviewed
    periodStart: { type: Date, required: [true, 'Period start is required'] },
    periodEnd:   { type: Date, required: [true, 'Period end is required'] },

    // Review window
    reviewStart: { type: Date, required: [true, 'Review start is required'] },
    reviewEnd:   { type: Date, required: [true, 'Review end is required'] },

    // Deadlines
    selfRatingDeadline:    { type: Date, required: true },
    managerRatingDeadline: { type: Date, required: true },

    // Rating weights (must total 100)
    selfRatingWeight:    { type: Number, default: 30, min: 0, max: 100 },
    managerRatingWeight: { type: Number, default: 70, min: 0, max: 100 },

    // Rating scale
    ratingScale: { type: Number, default: 5, enum: [5, 10] },

    // Goal limits
    minGoals: { type: Number, default: 1, min: 1 },
    maxGoals: { type: Number, default: 10, min: 1 },

    // Scope
    applicableTo: {
      type: String,
      enum: SCOPES,
      default: 'all',
    },
    department_ids: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
    }],
    employee_ids: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
    }],

    // Template (optional — auto-create goals from template on activation)
    template_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AppraisalTemplate',
      default: null,
    },

    status: {
      type: String,
      enum: STATUSES,
      default: 'draft',
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

appraisalCycleSchema.index({ company_id: 1, status: 1 });

module.exports = mongoose.model('AppraisalCycle', appraisalCycleSchema);
module.exports.TYPES = TYPES;
module.exports.STATUSES = STATUSES;
module.exports.SCOPES = SCOPES;
