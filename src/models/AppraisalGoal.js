const mongoose = require('mongoose');

const GOAL_STATUSES = ['draft', 'pending_approval', 'approved', 'rejected'];

const appraisalGoalSchema = new mongoose.Schema(
  {
    company_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    cycle_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AppraisalCycle',
      required: true,
    },
    employee_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
    },
    record_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AppraisalRecord',
      required: true,
    },

    title: {
      type: String,
      required: [true, 'Goal title is required'],
      trim: true,
      maxlength: [200, 'Max 200 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Max 1000 characters'],
      default: null,
    },
    weightage: {
      type: Number,
      required: [true, 'Weightage is required'],
      min: [1, 'Minimum weightage is 1%'],
      max: [100, 'Maximum weightage is 100%'],
    },

    // Goal approval
    goalStatus: {
      type: String,
      enum: GOAL_STATUSES,
      default: 'draft',
    },
    goalRejectionReason: {
      type: String,
      trim: true,
      maxlength: [500, 'Max 500 characters'],
      default: null,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    approvedAt: { type: Date, default: null },

    // Self rating
    selfRating: { type: Number, default: null, min: 1 },
    selfComment: {
      type: String,
      trim: true,
      maxlength: [500, 'Max 500 characters'],
      default: null,
    },

    // Manager rating
    managerRating: { type: Number, default: null, min: 1 },
    managerComment: {
      type: String,
      trim: true,
      maxlength: [500, 'Max 500 characters'],
      default: null,
    },
  },
  { timestamps: true }
);

appraisalGoalSchema.index({ record_id: 1 });
appraisalGoalSchema.index({ cycle_id: 1, employee_id: 1 });

module.exports = mongoose.model('AppraisalGoal', appraisalGoalSchema);
module.exports.GOAL_STATUSES = GOAL_STATUSES;
