const mongoose = require('mongoose');

// Permissions are system-wide — shared across all companies
// Format: module:action (e.g. employees:create, leave_requests:approve)
const permissionSchema = new mongoose.Schema(
  {
    module: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    action: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    description: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// Each module:action pair must be unique
permissionSchema.index({ module: 1, action: 1 }, { unique: true });

// Virtual: full permission key
permissionSchema.virtual('key').get(function () {
  return `${this.module}:${this.action}`;
});

permissionSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Permission', permissionSchema);
