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

const createClaimValidator = [
  body('category_id')
    .notEmpty().withMessage('Category is required.')
    .isMongoId().withMessage('Invalid category ID.'),
  body('description')
    .notEmpty().withMessage('Description is required.')
    .trim()
    .isLength({ max: 500 }).withMessage('Max 500 characters.'),
  body('amount')
    .notEmpty().withMessage('Amount is required.')
    .isFloat({ min: 0.01 }).withMessage('Amount must be greater than 0.'),
  body('expenseDate')
    .notEmpty().withMessage('Expense date is required.')
    .isISO8601().withMessage('Expense date must be a valid date.'),
  body('purpose')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 500 }).withMessage('Max 500 characters.'),
  validate,
];

const updateClaimValidator = [
  body('category_id')
    .optional()
    .isMongoId().withMessage('Invalid category ID.'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Max 500 characters.'),
  body('amount')
    .optional()
    .isFloat({ min: 0.01 }).withMessage('Amount must be greater than 0.'),
  body('expenseDate')
    .optional()
    .isISO8601().withMessage('Expense date must be a valid date.'),
  body('purpose')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 500 }).withMessage('Max 500 characters.'),
  validate,
];

const hrApproveValidator = [
  body('paymentMode')
    .notEmpty().withMessage('Payment mode is required.')
    .isIn(['payroll', 'immediate']).withMessage('Payment mode must be "payroll" or "immediate".'),
  body('note')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 500 }).withMessage('Max 500 characters.'),
  body('immediatePaymentRef')
    .if(body('paymentMode').equals('immediate'))
    .notEmpty().withMessage('Payment reference is required for immediate payment.'),
  body('immediatePaymentDate')
    .optional()
    .isISO8601().withMessage('Payment date must be a valid date.'),
  body('immediatePaymentNote')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 500 }).withMessage('Max 500 characters.'),
  validate,
];

const rejectValidator = [
  body('reason')
    .notEmpty().withMessage('Rejection reason is required.')
    .trim()
    .isLength({ max: 500 }).withMessage('Max 500 characters.'),
  validate,
];

module.exports = {
  createClaimValidator,
  updateClaimValidator,
  hrApproveValidator,
  rejectValidator,
};
