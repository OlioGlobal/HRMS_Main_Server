const mongoose = require('mongoose');

const expenseCategorySchema = new mongoose.Schema(
  {
    company_id: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Company',
      required: true,
      index:    true,
    },
    name: {
      type:      String,
      required:  [true, 'Category name is required'],
      trim:      true,
      maxlength: [100, 'Max 100 characters'],
    },
    description: {
      type:      String,
      trim:      true,
      maxlength: [500, 'Max 500 characters'],
      default:   null,
    },
    perClaimLimit: {
      type:    Number,
      default: null,
    },
    monthlyLimit: {
      type:    Number,
      default: null,
    },
    requiresReceipt: {
      type:    Boolean,
      default: true,
    },
    isActive: {
      type:    Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

expenseCategorySchema.index({ company_id: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('ExpenseCategory', expenseCategorySchema);
