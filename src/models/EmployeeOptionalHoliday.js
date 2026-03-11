const mongoose = require('mongoose');

const employeeOptionalHolidaySchema = new mongoose.Schema(
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
    holiday_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PublicHoliday',
      required: true,
    },
    year: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true }
);

employeeOptionalHolidaySchema.index(
  { company_id: 1, employee_id: 1, holiday_id: 1 },
  { unique: true }
);
employeeOptionalHolidaySchema.index({ employee_id: 1, year: 1 });

module.exports = mongoose.model('EmployeeOptionalHoliday', employeeOptionalHolidaySchema);
