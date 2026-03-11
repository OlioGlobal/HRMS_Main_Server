const mongoose = require('mongoose');

const MISSED_TYPES = ['clock_in', 'clock_out', 'both'];
const STATUSES     = ['pending', 'approved', 'rejected', 'cancelled'];

const regularizationRequestSchema = new mongoose.Schema(
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
    attendance_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AttendanceRecord',
      required: [true, 'Attendance record is required'],
    },
    date: {
      type: Date,
      required: [true, 'Date is required'],
    },
    missedType: {
      type: String,
      enum: MISSED_TYPES,
      required: [true, 'Missed type is required'],
    },
    requestedClockIn:  { type: Date, default: null },
    requestedClockOut: { type: Date, default: null },
    reason: {
      type: String,
      trim: true,
      required: [true, 'Reason is required'],
      maxlength: [500, 'Max 500 characters'],
    },
    status: {
      type: String,
      enum: STATUSES,
      default: 'pending',
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

regularizationRequestSchema.index({ employee_id: 1, status: 1 });
regularizationRequestSchema.index({ company_id: 1, status: 1 });

module.exports = mongoose.model('RegularizationRequest', regularizationRequestSchema);
module.exports.MISSED_TYPES = MISSED_TYPES;
module.exports.STATUSES = STATUSES;
