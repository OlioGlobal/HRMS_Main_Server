const mongoose = require('mongoose');

const componentLineSchema = new mongoose.Schema(
  {
    component_id: { type: mongoose.Schema.Types.ObjectId, ref: 'SalaryComponent' },
    name:     { type: String, required: true },
    calcType: { type: String, enum: ['fixed', 'percentage', 'percentOfCTC'], required: true },
    value:    { type: Number, required: true },
    amount:   { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false }
);

const payrollRecordSchema = new mongoose.Schema(
  {
    company_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    payrollRun_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PayrollRun',
      required: true,
      index: true,
    },
    employee_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
    },
    month: { type: Number, required: true },
    year:  { type: Number, required: true },

    // ─── Attendance Summary ─────────────────────────────────────────────────────
    totalWorkingDays:     { type: Number, default: 0 },
    effectiveWorkingDays: { type: Number, default: 0 },
    daysWorked:           { type: Number, default: 0 },
    halfDays:             { type: Number, default: 0 },
    daysAbsent:           { type: Number, default: 0 },
    lwpDays:              { type: Number, default: 0 },
    paidLeaveDays:        { type: Number, default: 0 },
    lateCount:            { type: Number, default: 0 },
    deductibleLateCount:  { type: Number, default: 0 },
    overtimeHours:        { type: Number, default: 0 },

    // ─── Salary Snapshot ────────────────────────────────────────────────────────
    employeeSalary_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EmployeeSalary',
      default: null,
    },
    ctcMonthly: { type: mongoose.Schema.Types.Mixed, default: 0 },

    earnings:   { type: [componentLineSchema], default: [] },
    deductions: { type: [componentLineSchema], default: [] },

    // ─── Calculated ─────────────────────────────────────────────────────────────
    perDaySalary:  { type: mongoose.Schema.Types.Mixed, default: 0 },
    perHourSalary: { type: mongoose.Schema.Types.Mixed, default: 0 },

    lwpDeductionAmount:     { type: mongoose.Schema.Types.Mixed, default: 0 },
    absentDeductionAmount:  { type: mongoose.Schema.Types.Mixed, default: 0 },
    halfDayDeductionAmount: { type: mongoose.Schema.Types.Mixed, default: 0 },
    lateDeductionAmount:    { type: mongoose.Schema.Types.Mixed, default: 0 },
    overtimeAmount:         { type: mongoose.Schema.Types.Mixed, default: 0 },

    grossEarnings:   { type: mongoose.Schema.Types.Mixed, default: 0 },
    totalDeductions: { type: mongoose.Schema.Types.Mixed, default: 0 },
    netPay:          { type: mongoose.Schema.Types.Mixed, default: 0 },

    // ─── Comp-off tracking ──────────────────────────────────────────────────────
    compOffHoursEarned: { type: Number, default: 0 },
    compOffCredited:    { type: Boolean, default: false },

    // ─── Reimbursements (non-taxable, added directly to netPay) ────────────────
    reimbursementTotal: { type: mongoose.Schema.Types.Mixed, default: 0 },
    reimbursements: [{
      reimbursement_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Reimbursement' },
      description: { type: String },
      amount: { type: Number },
    }],

    // ─── Flags ──────────────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ['ready', 'warning', 'skipped', 'edited'],
      default: 'ready',
    },
    warnings: { type: [String], default: [] },

    isManualEdit:   { type: Boolean, default: false },
    manualEditBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    manualEditAt:   { type: Date, default: null },
    manualEditNote: { type: String, trim: true, maxlength: 300, default: null },
  },
  { timestamps: true }
);

payrollRecordSchema.index({ payrollRun_id: 1, employee_id: 1 }, { unique: true });
payrollRecordSchema.index({ employee_id: 1, month: 1, year: 1 });

module.exports = mongoose.model('PayrollRecord', payrollRecordSchema);
