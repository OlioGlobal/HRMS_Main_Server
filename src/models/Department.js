const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema(
  {
    company_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Department name is required'],
      trim: true,
      maxlength: [100, 'Max 100 characters'],
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    parent_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      default: null,
    },
    // Will be populated once Employee module is built
    head_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    description: {
      type: String,
      trim: true,
      default: null,
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// slug unique per company
departmentSchema.index({ company_id: 1, slug: 1 }, { unique: true });

module.exports = mongoose.model('Department', departmentSchema);
