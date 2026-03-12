const { body, param, validationResult } = require('express-validator');

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

const initiateRunValidator = [
  body('month')
    .isInt({ min: 1, max: 12 }).withMessage('Month must be 1–12.'),
  body('year')
    .isInt({ min: 2020, max: 2100 }).withMessage('Year must be 2020–2100.'),
  body('notes')
    .optional()
    .isString().isLength({ max: 500 }).withMessage('Notes max 500 characters.'),
  validate,
];

const editRecordValidator = [
  body('manualEditNote')
    .trim().notEmpty().withMessage('A reason is required for manual edits.')
    .isLength({ max: 300 }).withMessage('Note max 300 characters.'),
  body('daysWorked').optional().isFloat({ min: 0 }).withMessage('Invalid daysWorked.'),
  body('halfDays').optional().isFloat({ min: 0 }).withMessage('Invalid halfDays.'),
  body('daysAbsent').optional().isFloat({ min: 0 }).withMessage('Invalid daysAbsent.'),
  body('lwpDays').optional().isFloat({ min: 0 }).withMessage('Invalid lwpDays.'),
  body('lateCount').optional().isInt({ min: 0 }).withMessage('Invalid lateCount.'),
  body('deductibleLateCount').optional().isInt({ min: 0 }).withMessage('Invalid deductibleLateCount.'),
  body('overtimeHours').optional().isFloat({ min: 0 }).withMessage('Invalid overtimeHours.'),
  body('lwpDeductionAmount').optional().isFloat({ min: 0 }).withMessage('Invalid amount.'),
  body('absentDeductionAmount').optional().isFloat({ min: 0 }).withMessage('Invalid amount.'),
  body('halfDayDeductionAmount').optional().isFloat({ min: 0 }).withMessage('Invalid amount.'),
  body('lateDeductionAmount').optional().isFloat({ min: 0 }).withMessage('Invalid amount.'),
  body('overtimeAmount').optional().isFloat({ min: 0 }).withMessage('Invalid amount.'),
  body('grossEarnings').optional().isFloat({ min: 0 }).withMessage('Invalid amount.'),
  body('totalDeductions').optional().isFloat({ min: 0 }).withMessage('Invalid amount.'),
  body('netPay').optional().isFloat({ min: 0 }).withMessage('Invalid amount.'),
  validate,
];

module.exports = { initiateRunValidator, editRecordValidator };
