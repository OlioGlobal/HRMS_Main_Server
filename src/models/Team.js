const mongoose = require('mongoose');

const teamSchema = new mongoose.Schema(
  {
    company_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Team name is required'],
      trim: true,
      maxlength: [100, 'Max 100 characters'],
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    department_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      required: [true, 'Department is required'],
    },
    // Will be linked once Employee module is built
    lead_user_id: {
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
teamSchema.index({ company_id: 1, slug: 1 }, { unique: true });

module.exports = mongoose.model('Team', teamSchema);
