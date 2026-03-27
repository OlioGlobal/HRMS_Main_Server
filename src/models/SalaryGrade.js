const mongoose = require('mongoose');

const gradeComponentSchema = new mongoose.Schema(
  {
    component_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SalaryComponent',
      required: true,
    },
    calcType: {
      type: String,
      enum: ['fixed', 'percentage', 'percentOfCTC'],
      required: true,
    },
    value: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

const salaryGradeSchema = new mongoose.Schema(
  {
    company_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Grade name is required'],
      trim: true,
      maxlength: [100, 'Max 100 characters'],
    },
    minCTC: {
      type: Number,
      default: 0,
      min: 0,
    },
    maxCTC: {
      type: Number,
      default: 0,
      min: 0,
    },
    components: {
      type: [gradeComponentSchema],
      default: [],
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

salaryGradeSchema.index({ company_id: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('SalaryGrade', salaryGradeSchema);
