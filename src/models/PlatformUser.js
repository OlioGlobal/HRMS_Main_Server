const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

// Platform-level Super Admin (SaaS owner). Completely separate from the per-company
// User model — these users are NOT scoped to any company and manage all tenants.
const platformUserSchema = new mongoose.Schema(
  {
    name:  { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false,
    },
    role: {
      type: String,
      enum: ['super_admin'],
      default: 'super_admin',
    },
    isActive:      { type: Boolean, default: true },
    lastLogin:     { type: Date, default: null },
    refreshTokens: { type: [String], select: false, default: [] },
  },
  { timestamps: true }
);

// Hash password before save — Mongoose v7+ async hooks don't use next()
platformUserSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

platformUserSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('PlatformUser', platformUserSchema);
