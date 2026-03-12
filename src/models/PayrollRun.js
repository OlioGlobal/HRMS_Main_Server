const mongoose = require('mongoose');

const payrollRunSchema = new mongoose.Schema(
  {
    company_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    month: { type: Number, required: true, min: 1, max: 12 },
    year:  { type: Number, required: true },

    status: {
      type: String,
      enum: ['draft', 'processing', 'review', 'approved', 'paid'],
      default: 'draft',
    },

    totalEmployees:  { type: Number, default: 0 },
    totalGross:      { type: Number, default: 0 },
    totalDeductions: { type: Number, default: 0 },
    totalNetPay:     { type: Number, default: 0 },
    warnings:        { type: Number, default: 0 },

    initiatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    approvedAt: { type: Date, default: null },
    paidAt:     { type: Date, default: null },
    lockedAt:   { type: Date, default: null },

    notes: { type: String, trim: true, maxlength: 500, default: null },
  },
  { timestamps: true }
);

// One run per company per month
payrollRunSchema.index({ company_id: 1, month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('PayrollRun', payrollRunSchema);
