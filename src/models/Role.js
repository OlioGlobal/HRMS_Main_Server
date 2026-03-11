const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema(
  {
    company_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    description: {
      type: String,
      default: null,
    },
    level: {
      type: Number,
      required: true,
      // Lower = higher authority (1 = Super Admin, 5 = Employee)
    },
    isSystem: {
      type: Boolean,
      default: false, // true = cannot be deleted (Super Admin)
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Role name must be unique per company
roleSchema.index({ company_id: 1, slug: 1 }, { unique: true });

module.exports = mongoose.model('Role', roleSchema);
