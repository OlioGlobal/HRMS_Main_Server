const mongoose = require('mongoose');

const userRoleSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    role_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Role',
      required: true,
    },
    company_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null, // null = system assigned (on signup)
    },
  },
  { timestamps: true }
);

// A user can only have a role once per company
userRoleSchema.index({ user_id: 1, role_id: 1, company_id: 1 }, { unique: true });

module.exports = mongoose.model('UserRole', userRoleSchema);
