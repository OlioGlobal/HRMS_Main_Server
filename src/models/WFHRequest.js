const mongoose = require('mongoose');

const STATUSES = ['pending', 'approved', 'rejected', 'cancelled'];

const wfhRequestSchema = new mongoose.Schema(
  {
    company_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    employee_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
      index: true,
    },
    startDate: {
      type: Date,
      required: [true, 'Start date is required'],
    },
    endDate: {
      type: Date,
      required: [true, 'End date is required'],
    },
    reason: {
      type: String,
      trim: true,
      maxlength: [500, 'Max 500 characters'],
      default: null,
    },
    status: {
      type: String,
      enum: STATUSES,
      default: 'pending',
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    rejectedReason: {
      type: String,
      trim: true,
      maxlength: [500, 'Max 500 characters'],
      default: null,
    },
  },
  { timestamps: true }
);

wfhRequestSchema.index({ company_id: 1, employee_id: 1, startDate: 1, endDate: 1 });
wfhRequestSchema.index({ company_id: 1, status: 1 });

module.exports = mongoose.model('WFHRequest', wfhRequestSchema);
module.exports.STATUSES = STATUSES;
