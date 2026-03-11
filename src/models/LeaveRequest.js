const mongoose = require('mongoose');

const STATUSES = ['pending', 'approved', 'rejected', 'cancelled'];

const leaveRequestSchema = new mongoose.Schema(
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
    },
    leaveType_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LeaveType',
      required: true,
    },
    startDate: {
      type: Date,
      required: [true, 'Start date is required'],
    },
    endDate: {
      type: Date,
      required: [true, 'End date is required'],
    },
    totalDays: {
      type: Number,
      required: true,
      min: 0.5,
    },
    isHalfDay: {
      type: Boolean,
      default: false,
    },
    halfDaySession: {
      type: String,
      enum: ['morning', 'afternoon', null],
      default: null,
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
    isLWP: {
      type: Boolean,
      default: false,
    },
    appliedAt: {
      type: Date,
      default: Date.now,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    reviewNote: {
      type: String,
      trim: true,
      maxlength: [300, 'Max 300 characters'],
      default: null,
    },
  },
  { timestamps: true }
);

leaveRequestSchema.index({ employee_id: 1, status: 1 });
leaveRequestSchema.index({ company_id: 1, status: 1 });
leaveRequestSchema.index({ employee_id: 1, startDate: 1, endDate: 1 });

module.exports = mongoose.model('LeaveRequest', leaveRequestSchema);
module.exports.STATUSES = STATUSES;
