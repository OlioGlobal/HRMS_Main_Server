const mongoose = require('mongoose');

const leaveBalanceSchema = new mongoose.Schema(
  {
    company_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    employee_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
    },
    leaveType_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LeaveType',
      required: true,
    },
    year: {
      type: Number,
      required: true,
    },
    allocated: {
      type: Number,
      default: 0,
      min: 0,
    },
    carryForward: {
      type: Number,
      default: 0,
      min: 0,
    },
    used: {
      type: Number,
      default: 0,
      min: 0,
    },
    pending: {
      type: Number,
      default: 0,
      min: 0,
    },
    adjustment: {
      type: Number,
      default: 0, // positive = credit, negative = debit
    },
    adjustmentNote: {
      type: String,
      trim: true,
      maxlength: [200, 'Max 200 characters'],
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

leaveBalanceSchema.virtual('remaining').get(function () {
  return this.allocated + this.carryForward + this.adjustment - this.used - this.pending;
});

leaveBalanceSchema.index(
  { company_id: 1, employee_id: 1, leaveType_id: 1, year: 1 },
  { unique: true }
);
leaveBalanceSchema.index({ employee_id: 1, year: 1 });

module.exports = mongoose.model('LeaveBalance', leaveBalanceSchema);
