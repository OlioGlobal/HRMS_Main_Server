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

const applyValidator = [
  body('startDate')
    .notEmpty().withMessage('Start date is required.')
    .isISO8601().withMessage('Start date must be a valid date.'),
  body('endDate')
    .optional({ nullable: true })
    .isISO8601().withMessage('End date must be a valid date.'),
  body('reason')
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

module.exports = { applyValidator, rejectValidator };
