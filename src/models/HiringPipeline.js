const mongoose = require('mongoose');

const EMPLOYEE_STATUSES = ['pre_join', 'offered', 'accepted', 'active'];

const pipelineStepSchema = new mongoose.Schema({
  order:      { type: Number, required: true },
  name:       { type: String, required: true, trim: true },
  letterType: { type: String, required: true },

  // Default template for this step (HR can override at generation time)
  template_id: {
    type:    mongoose.Schema.Types.ObjectId,
    ref:     'LetterTemplate',
    default: null,
  },

  // Fields that must be set on the employee before this step can generate
  // e.g., ['salary', 'workPolicy', 'leaveTemplate', 'reportingManager']
  requiredFields: { type: [String], default: [] },

  // Employee status to set after this step is marked complete
  setStatusTo: {
    type:    String,
    enum:    EMPLOYEE_STATUSES,
    default: null,
  },

  // Whether candidate must accept this letter on pre-boarding portal
  requiresAcceptance: { type: Boolean, default: true },
}, { _id: false });

const hiringPipelineSchema = new mongoose.Schema(
  {
    company_id: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Company',
      required: true,
      index:    true,
    },

    name:      { type: String, required: true, trim: true },
    steps:     { type: [pipelineStepSchema], default: [] },
    isDefault: { type: Boolean, default: false },
    isActive:  { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

hiringPipelineSchema.index({ company_id: 1, isDefault: 1 });

module.exports = mongoose.model('HiringPipeline', hiringPipelineSchema);
