const mongoose = require('mongoose');

const ATTENDANCE_STATUSES = ['present', 'late', 'half_day', 'absent', 'on_leave', 'holiday'];
const CLOCK_TYPES        = ['office', 'wfh', 'remote'];

const attendanceRecordSchema = new mongoose.Schema(
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
    date: {
      type: Date,
      required: [true, 'Date is required'],
    },

    // ─── Clock times (UTC) ────────────────────────────────────────────────────
    clockInTime:  { type: Date, default: null },
    clockOutTime: { type: Date, default: null },

    // ─── Location ─────────────────────────────────────────────────────────────
    clockInType:  { type: String, enum: CLOCK_TYPES, default: null },
    clockOutType: { type: String, enum: CLOCK_TYPES, default: null },
    clockInLat:   { type: Number, default: null },
    clockInLng:   { type: Number, default: null },
    clockOutLat:  { type: Number, default: null },
    clockOutLng:  { type: Number, default: null },

    // ─── Calculated ───────────────────────────────────────────────────────────
    totalHours:    { type: Number, default: 0 },
    overtimeHours: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ATTENDANCE_STATUSES,
      default: 'present',
    },
    isLate:        { type: Boolean, default: false },
    lateByMinutes: { type: Number, default: 0 },

    missedClockOut: { type: Boolean, default: false },

    // ─── Override ─────────────────────────────────────────────────────────────
    isManualOverride: { type: Boolean, default: false },
    overrideReason:   { type: String, trim: true, maxlength: 500, default: null },
    overrideBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    // ─── Policy snapshot (only needed fields for status calc) ─────────────────
    workPolicySnapshot: {
      workStart:              { type: String, default: null },   // "HH:mm"
      workEnd:                { type: String, default: null },
      graceMinutes:           { type: Number, default: null },
      lateMarkAfterMinutes:   { type: Number, default: null },
      halfDayThresholdHours:  { type: Number, default: null },
      absentThresholdHours:   { type: Number, default: null },
      overtimeThresholdHours: { type: Number, default: null },
    },
  },
  { timestamps: true }
);

// One record per employee per day
attendanceRecordSchema.index({ company_id: 1, employee_id: 1, date: 1 }, { unique: true });
attendanceRecordSchema.index({ company_id: 1, date: 1 });
attendanceRecordSchema.index({ employee_id: 1, date: 1 });

module.exports = mongoose.model('AttendanceRecord', attendanceRecordSchema);
module.exports.ATTENDANCE_STATUSES = ATTENDANCE_STATUSES;
module.exports.CLOCK_TYPES = CLOCK_TYPES;
