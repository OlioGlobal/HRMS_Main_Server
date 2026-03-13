const mongoose = require('mongoose');

const appraisalTemplateSchema = new mongoose.Schema(
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
    goals: [
      {
        title: {
          type: String,
          required: true,
          trim: true,
          maxlength: [200, 'Max 200 characters'],
        },
        description: {
          type: String,
          trim: true,
          maxlength: [1000, 'Max 1000 characters'],
          default: null,
        },
        defaultWeightage: {
          type: Number,
          required: true,
          min: 1,
          max: 100,
        },
      },
    ],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

appraisalTemplateSchema.index({ company_id: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('AppraisalTemplate', appraisalTemplateSchema);
