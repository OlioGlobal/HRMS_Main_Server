const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema(
  {
    company_id: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Company',
      required: true,
      index:    true,
    },

    // Auto-generated ID per company (EMP001, EMP002, …); null until candidate is activated
    employeeId: {
      type:     String,
      default:  null,
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
    joiningDate: { type: Date, default: null },

    // Rough monthly gross estimate — used for pre-join offer letter before salary is set
    roughGross: { type: Number, default: null },

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
    workMode: {
      type:    String,
      enum:    ['office', 'wfh', 'field'],
      default: 'office',
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
      enum:    ['pre_join', 'offered', 'accepted', 'active', 'inactive', 'notice', 'terminated'],
      default: 'active',
    },

    // ─── Hiring Pipeline ────────────────────────────────────────────────────────
    pipeline_id: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'HiringPipeline',
      default: null,
    },
    pipelineCurrentStep: { type: Number, default: 0 },

    // HR staff assigned to manage this candidate through hiring
    assignedHr_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // ─── Pre-Boarding Portal ────────────────────────────────────────────────────
    // personalEmail used to send portal link before work email is assigned
    personalEmail:         { type: String, lowercase: true, trim: true, default: null },
    preBoardingToken:      { type: String, default: null },
    preBoardingTokenExpiry:{ type: Date,   default: null },

    // Bank details — filled by candidate on pre-boarding portal
    bankDetails: {
      bankName:      { type: String, default: null },
      accountNumber: { type: String, default: null },
      ifscCode:      { type: String, default: null },
      accountType:   { type: String, enum: ['savings', 'current', null], default: null },
    },

    // HR verification of candidate-submitted personal details
    personalDetailsVerifiedAt: { type: Date,                              default: null },
    personalDetailsVerifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // HR override — marks pre-boarding complete even if some docs are missing/pending
    preboardingOverriddenAt: { type: Date,                              default: null },
    preboardingOverriddenBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // Notice period in days — used in letters
    noticePeriodDays: { type: Number, default: null },

    // ─── Onboarding ───────────────────────────────────────────────────────────
    onboardingCompleted:   { type: Boolean, default: false },
    onboardingCompletedAt: { type: Date,    default: null },

    // ─── Offboarding ──────────────────────────────────────────────────────────
    lastWorkingDay:          { type: Date,    default: null },
    knowledgeTransfer:       { type: Boolean, default: false },
    assetsReturned:          { type: Boolean, default: false },
    exitInterview:           { type: Boolean, default: false },
    accessRevoked:           { type: Boolean, default: false },
    offboardingCompletedAt:  { type: Date,    default: null },

    // ─── Portal access ──────────────────────────────────────────────────────────
    user_id: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'User',
      default: null,
    },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Unique employeeId per company — only index non-null string values (candidates have null)
employeeSchema.index({ company_id: 1, employeeId: 1 }, { unique: true, partialFilterExpression: { employeeId: { $type: 'string' } } });
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
