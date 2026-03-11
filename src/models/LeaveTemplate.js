const mongoose = require('mongoose');

const templateLeaveTypeSchema = new mongoose.Schema(
  {
    leaveType_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LeaveType',
      required: true,
    },
    daysOverride: {
      type: Number,
      default: null, // null = use default from LeaveType.daysPerYear
      min: 0,
    },
  },
  { _id: false }
);

const leaveTemplateSchema = new mongoose.Schema(
  {
    company_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Template name is required'],
      trim: true,
      maxlength: [100, 'Max 100 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [300, 'Max 300 characters'],
      default: null,
    },
    leaveTypes: [templateLeaveTypeSchema],
    isDefault: {
      type: Boolean,
      default: false,
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

leaveTemplateSchema.index({ company_id: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('LeaveTemplate', leaveTemplateSchema);
