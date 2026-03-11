const mongoose = require('mongoose');

const salaryComponentSchema = new mongoose.Schema(
  {
    company_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Component name is required'],
      trim: true,
      maxlength: [100, 'Max 100 characters'],
    },
    type: {
      type: String,
      enum: ['earning', 'deduction'],
      required: [true, 'Component type is required'],
    },
    calcType: {
      type: String,
      enum: ['fixed', 'percentage'],
      default: 'fixed',
    },
    percentOf: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SalaryComponent',
      default: null,
    },
    defaultValue: {
      type: Number,
      default: 0,
      min: 0,
    },
    taxable: {
      type: Boolean,
      default: true,
    },
    statutory: {
      type: Boolean,
      default: false,
    },
    order: {
      type: Number,
      default: 0,
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

salaryComponentSchema.index({ company_id: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('SalaryComponent', salaryComponentSchema);
