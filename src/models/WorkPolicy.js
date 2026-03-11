const mongoose = require('mongoose');

const workPolicySchema = new mongoose.Schema(
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
      required: [true, 'Location is required'],
    },
    name: {
      type: String,
      required: [true, 'Policy name is required'],
      trim: true,
      maxlength: [100, 'Max 100 characters'],
    },
    shiftType: {
      type: String,
      enum: ['fixed', 'flexible', 'night'],
      default: 'fixed',
    },

    // ─── Shift Hours ───────────────────────────────────────────────────────────
    workStart:   { type: String, default: '09:00' },   // "HH:mm"
    workEnd:     { type: String, default: '18:00' },   // "HH:mm"
    workingDays: {
      type: [String],
      enum: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
      default: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
    },

    // ─── Attendance Thresholds ─────────────────────────────────────────────────
    // All time values are in minutes or hours as documented
    graceMinutes:           { type: Number, default: 10  },  // grace before marking late
    lateMarkAfterMinutes:   { type: Number, default: 15  },  // late if arrives X mins after shift start + grace
    halfDayThresholdHours:  { type: Number, default: 4   },  // worked < X hrs = half day
    absentThresholdHours:   { type: Number, default: 2   },  // worked < X hrs = absent
    overtimeThresholdHours: { type: Number, default: 8   },  // worked > X hrs = overtime begins

    isDefault: { type: Boolean, default: false },   // one default policy per company
    isActive:  { type: Boolean, default: true  },
  },
  { timestamps: true }
);

workPolicySchema.index({ company_id: 1, name: 1 }, { unique: true });
workPolicySchema.index({ company_id: 1, location_id: 1 });

module.exports = mongoose.model('WorkPolicy', workPolicySchema);
