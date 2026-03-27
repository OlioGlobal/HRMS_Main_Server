const mongoose = require('mongoose');

const STATUSES = ['draft', 'submitted', 'manager_approved', 'hr_approved', 'rejected', 'paid'];
const PAYMENT_MODES = ['payroll', 'immediate'];
const REJECTED_STAGES = ['manager', 'hr'];

const reimbursementSchema = new mongoose.Schema(
  {
    company_id: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Company',
      required: true,
      index:    true,
    },
    employee_id: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Employee',
      required: true,
      index:    true,
    },
    category_id: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'ExpenseCategory',
      required: true,
    },
    description: {
      type:      String,
      required:  [true, 'Description is required'],
      trim:      true,
      maxlength: [500, 'Max 500 characters'],
    },
    amount: {
      type:     Number,
      required: [true, 'Amount is required'],
      min:      [0, 'Amount cannot be negative'],
    },
    expenseDate: {
      type:     Date,
      required: [true, 'Expense date is required'],
    },
    receiptFileKey: {
      type:    String,
      default: null,
    },
    receiptFileName: {
      type:    String,
      default: null,
    },
    purpose: {
      type:      String,
      trim:      true,
      maxlength: [500, 'Max 500 characters'],
      default:   null,
    },

    // ─── Status ──────────────────────────────────────────────────────────────────
    status: {
      type:    String,
      enum:    STATUSES,
      default: 'draft',
    },

    // ─── Manager Approval ────────────────────────────────────────────────────────
    managerApprovedBy: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'User',
      default: null,
    },
    managerApprovedAt: {
      type:    Date,
      default: null,
    },
    managerNote: {
      type:      String,
      maxlength: [500, 'Max 500 characters'],
      default:   null,
    },

    // ─── HR Approval ─────────────────────────────────────────────────────────────
    hrApprovedBy: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'User',
      default: null,
    },
    hrApprovedAt: {
      type:    Date,
      default: null,
    },
    hrNote: {
      type:      String,
      maxlength: [500, 'Max 500 characters'],
      default:   null,
    },

    // ─── Rejection ───────────────────────────────────────────────────────────────
    rejectedBy: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'User',
      default: null,
    },
    rejectedAt: {
      type:    Date,
      default: null,
    },
    rejectionReason: {
      type:      String,
      maxlength: [500, 'Max 500 characters'],
      default:   null,
    },
    rejectedAtStage: {
      type:    String,
      enum:    [...REJECTED_STAGES, null],
      default: null,
    },

    // ─── Payment ─────────────────────────────────────────────────────────────────
    paymentMode: {
      type:    String,
      enum:    PAYMENT_MODES,
      default: 'payroll',
    },
    payrollRun_id: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'PayrollRun',
      default: null,
    },
    paidAt: {
      type:    Date,
      default: null,
    },
    immediatePaymentRef: {
      type:    String,
      default: null,
    },
    immediatePaymentDate: {
      type:    Date,
      default: null,
    },
    immediatePaymentBy: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'User',
      default: null,
    },
    immediatePaymentNote: {
      type:      String,
      maxlength: [500, 'Max 500 characters'],
      default:   null,
    },

    // ─── Policy ──────────────────────────────────────────────────────────────────
    policyLimitExceeded: {
      type:    Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

reimbursementSchema.index({ company_id: 1, employee_id: 1, status: 1 });
reimbursementSchema.index({ company_id: 1, status: 1, expenseDate: 1 });

module.exports = mongoose.model('Reimbursement', reimbursementSchema);
module.exports.STATUSES = STATUSES;
module.exports.PAYMENT_MODES = PAYMENT_MODES;
