const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema(
  {
    company_id: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Company',
      required: true,
      index:    true,
    },

    // Auto-generated ID per company (EMP001, EMP002, …)
    employeeId: {
      type:     String,
      required: true,
      trim:     true,
    },

    // ─── Personal ───────────────────────────────────────────────────────────────
    firstName: { type: String, required: true, trim: true },
    lastName:  { type: String, required: true, trim: true },

    // HR contact email (may differ from portal login email)
    email: { type: String, lowercase: true, trim: true, default: null },
    phone: { type: String, default: null },

    dateOfBirth: { type: Date, default: null },
    gender: {
      type: String,
      enum: ['male', 'female', 'other', 'prefer_not_to_say', null],
      default: null,
    },

    addresses: [{
      label:   { type: String, enum: ['home', 'permanent', 'current', 'other'], default: 'home' },
      street:  { type: String, default: null },
      city:    { type: String, default: null },
      state:   { type: String, default: null },
      country: { type: String, default: null },
      zip:     { type: String, default: null },
      lat:     { type: Number, default: null },
      lng:     { type: Number, default: null },
      isPrimary: { type: Boolean, default: false },
    }],

    emergencyContact: {
      name:     { type: String, default: null },
      phone:    { type: String, default: null },
      relation: { type: String, default: null },
    },

    avatar: { type: String, default: null },

    // ─── Job ────────────────────────────────────────────────────────────────────
    joiningDate: { type: Date, required: true },

    employmentType: {
      type:    String,
      enum:    ['full_time', 'part_time', 'contract', 'intern'],
      default: 'full_time',
    },

    department_id: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'Department',
      default: null,
    },
    team_id: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'Team',
      default: null,
    },
    location_id: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'Location',
      default: null,
    },
    workPolicy_id: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'WorkPolicy',
      default: null,
    },

    // Self-referencing — who this employee reports to
    reportingManager_id: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'Employee',
      default: null,
    },

    designation_id: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'Designation',
      default: null,
    },
    leaveTemplate_id: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'LeaveTemplate',
      default: null,
    },

    // ─── Probation ──────────────────────────────────────────────────────────────
    probationDays:       { type: Number, default: null, min: 0 },
    probationEndDate:    { type: Date,   default: null },
    probationStatus: {
      type:    String,
      enum:    ['ongoing', 'confirmed', 'extended', 'waived'],
      default: 'ongoing',
    },
    probationExtendedBy: { type: Number, default: null, min: 0 },
    probationOutcomeNote:{ type: String, default: null, trim: true },
    probationReviewedBy: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'User',
      default: null,
    },
    probationReviewedAt: { type: Date, default: null },

    // ─── Status ─────────────────────────────────────────────────────────────────
    status: {
      type:    String,
      enum:    ['active', 'inactive', 'notice', 'terminated'],
      default: 'active',
    },

    // ─── Portal access ──────────────────────────────────────────────────────────
    // null = no portal login; set when Step 3 is submitted
    user_id: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'User',
      default: null,
    },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Unique employeeId per company
employeeSchema.index({ company_id: 1, employeeId: 1 }, { unique: true });
// Quick lookups by status and department
employeeSchema.index({ company_id: 1, status: 1 });
employeeSchema.index({ company_id: 1, department_id: 1 });
employeeSchema.index({ company_id: 1, team_id: 1 });
// Link back from user
employeeSchema.index({ user_id: 1 }, { sparse: true });

// Virtual full name
employeeSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

employeeSchema.set('toJSON',   { virtuals: true });
employeeSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Employee', employeeSchema);
