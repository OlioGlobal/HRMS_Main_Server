const mongoose = require('mongoose');

const rolePermissionSchema = new mongoose.Schema(
  {
    role_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Role',
      required: true,
      index: true,
    },
    permission_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Permission',
      required: true,
    },
    scope: {
      type: String,
      enum: ['global', 'department', 'team', 'self'],
      default: 'self',
    },
  },
  { timestamps: true }
);

// A role can only have a permission once
rolePermissionSchema.index({ role_id: 1, permission_id: 1 }, { unique: true });

module.exports = mongoose.model('RolePermission', rolePermissionSchema);
