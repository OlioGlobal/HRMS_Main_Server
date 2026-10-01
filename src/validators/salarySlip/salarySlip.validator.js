const { body, validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      message: 'Validation failed.',
      errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
};

const sendSlipValidator = [
  body('employeeId').notEmpty().withMessage('Employee is required.').isMongoId().withMessage('Invalid employee.'),
  body('gradeId').notEmpty().withMessage('Salary grade is required.').isMongoId().withMessage('Invalid grade.'),
  body('month').notEmpty().withMessage('Month is required.').isInt({ min: 1, max: 12 }).withMessage('Month must be 1–12.'),
  body('year').notEmpty().withMessage('Year is required.').isInt({ min: 1970, max: 3000 }).withMessage('Invalid year.'),
  body('monthlySalary').notEmpty().withMessage('Monthly salary is required.').isFloat({ gt: 0 }).withMessage('Monthly salary must be greater than 0.'),
  body('actualPaid').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('Actual paid must be 0 or more.'),
  body('deductions').optional({ nullable: true }).isArray().withMessage('Deductions must be a list.'),
  body('deductions.*.name').optional().trim().notEmpty().withMessage('Deduction name is required.'),
  body('deductions.*.amount').optional().isFloat({ min: 0 }).withMessage('Deduction amount must be 0 or more.'),
  body('to').optional({ nullable: true }).trim().isEmail().withMessage('Recipient must be a valid email.'),
  body('cc').optional({ nullable: true }).isArray().withMessage('CC must be a list.'),
  body('cc.*').optional().trim().isEmail().withMessage('Each CC must be a valid email.'),
  body('bcc').optional({ nullable: true }).isArray().withMessage('BCC must be a list.'),
  body('bcc.*').optional().trim().isEmail().withMessage('Each BCC must be a valid email.'),
  validate,
];

module.exports = { sendSlipValidator };
