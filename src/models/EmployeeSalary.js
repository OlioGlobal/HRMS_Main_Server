const mongoose = require('mongoose');

const salarySnapshotComponentSchema = new mongoose.Schema(
  {
    component_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SalaryComponent',
      required: true,
    },
    name:     { type: String, required: true },
    type:     { type: String, enum: ['earning', 'deduction'], required: true },
    calcType: { type: String, enum: ['fixed', 'percentage'], required: true },
    value:    { type: Number, required: true, min: 0 },
    monthlyAmount: { type: Number, required: true },
  },
  { _id: false }
);

const employeeSalarySchema = new mongoose.Schema(
  {
    company_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    employee_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['grade', 'custom'],
      required: true,
    },
    salaryGrade_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SalaryGrade',
      default: null,
    },
    effectiveDate: {
      type: Date,
      required: [true, 'Effective date is required'],
    },
    reason: {
      type: String,
      trim: true,
      maxlength: [200, 'Max 200 characters'],
      default: null,
    },
    components: {
      type: [salarySnapshotComponentSchema],
      default: [],
    },
    ctcMonthly: {
      type: Number,
      required: true,
      min: 0,
    },
    ctcAnnual: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ['active', 'superseded'],
      default: 'active',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

employeeSalarySchema.index({ employee_id: 1, status: 1 });
employeeSalarySchema.index({ employee_id: 1, effectiveDate: -1 });

module.exports = mongoose.model('EmployeeSalary', employeeSalarySchema);
