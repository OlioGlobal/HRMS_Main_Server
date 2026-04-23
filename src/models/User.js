const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    company_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    firstName: { type: String, required: true, trim: true },
    lastName:  { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false,
    },
    phone:  { type: String, default: null },
    avatar: { type: String, default: null },
    status: {
      type: String,
      enum: ['active', 'inactive', 'suspended', 'invited'],
      default: 'active',
    },
    isEmailVerified:      { type: Boolean, default: false },
    emailVerificationToken: { type: String, select: false, default: null },
    passwordResetToken:   { type: String, select: false, default: null },
    passwordResetExpires: { type: Date,   select: false, default: null },
    lastLogin:            { type: Date,   default: null },
    loginPreference:      { type: String, enum: ['dashboard', 'portal'], default: null },
    refreshTokens:        { type: [String], select: false, default: [] },
  },
  { timestamps: true }
);

// Unique email per company (not globally unique)
userSchema.index({ email: 1, company_id: 1 }, { unique: true });

// Hash password before save — Mongoose v7+ async hooks don't use next()
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

// Compare password
userSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Virtual full name
userSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

userSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('User', userSchema);
