const mongoose = require('mongoose');

const STATUSES = [
  'not_started',       // cycle created, goals not set
  'goals_set',         // goals submitted, pending manager approval
  'goals_approved',    // goals approved, can self-rate when review window opens
  'self_submitted',    // self rating done, waiting for manager
  'manager_submitted', // manager rated, waiting for HR
  'finalized',         // HR finalized
];

const appraisalRecordSchema = new mongoose.Schema(
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
    // Reporting manager at time of appraisal creation
    manager_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      default: null,
    },
    // Reviewer — defaults to manager, HR can override if no manager
    reviewer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      default: null,
    },

    status: {
      type: String,
      enum: STATUSES,
      default: 'not_started',
    },

    // Self rating
    selfSubmittedAt: { type: Date, default: null },
    selfComments: {
      type: String,
      trim: true,
      maxlength: [1000, 'Max 1000 characters'],
      default: null,
    },

    // Manager rating
    managerSubmittedAt: { type: Date, default: null },
    managerComments: {
      type: String,
      trim: true,
      maxlength: [1000, 'Max 1000 characters'],
      default: null,
    },

    // Final
    finalRating: { type: Number, default: null }, // calculated from goals
    hrComments: {
      type: String,
      trim: true,
      maxlength: [1000, 'Max 1000 characters'],
      default: null,
    },
    finalizedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    finalizedAt: { type: Date, default: null },

    // Result sharing
    isSharedWithEmployee: { type: Boolean, default: false },
    sharedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

appraisalRecordSchema.index({ cycle_id: 1, employee_id: 1 }, { unique: true });
appraisalRecordSchema.index({ company_id: 1, employee_id: 1 });
appraisalRecordSchema.index({ reviewer_id: 1, status: 1 });

module.exports = mongoose.model('AppraisalRecord', appraisalRecordSchema);
module.exports.STATUSES = STATUSES;
