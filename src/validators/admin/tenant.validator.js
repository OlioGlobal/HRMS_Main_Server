const { body, validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      message: 'Validation failed.',
      errors:  errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
};

const assignPlanValidator = [
  body('planId')
    .notEmpty().withMessage('Plan is required.')
    .isMongoId().withMessage('Invalid plan id.'),

  body('startDate')
    .optional()
    .isISO8601().withMessage('Start date must be a valid date.'),

  body('expiryDate')
    .optional({ nullable: true })
    .custom((v) => {
      if (v === null || v === undefined || v === '') return true;
      const d = new Date(v);
      if (isNaN(d.getTime())) throw new Error('Expiry date must be a valid date.');
      if (d <= new Date()) throw new Error('Expiry date must be in the future.');
      return true;
    }),

  body('note')
    .optional({ nullable: true })
    .isString().withMessage('Note must be a string.'),

  validate,
];

module.exports = { assignPlanValidator };
