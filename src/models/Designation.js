const mongoose = require('mongoose');

const LEVELS = [
  'intern', 'junior', 'mid', 'senior',
  'lead', 'manager', 'director', 'executive',
];

const designationSchema = new mongoose.Schema(
  {
    company_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Designation name is required'],
      trim: true,
      maxlength: [100, 'Max 100 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Max 500 characters'],
      default: null,
    },
    level: {
      type: String,
      enum: LEVELS,
      required: [true, 'Level is required'],
    },
    department_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      default: null,
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

designationSchema.index({ company_id: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Designation', designationSchema);
module.exports.LEVELS = LEVELS;
