const { query, body, validationResult } = require('express-validator');

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

// ─── List notifications query params ─────────────────────────────────────────
const listNotificationsValidator = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer.'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100.'),

  query('isRead')
    .optional()
    .isIn(['true', 'false', 'all']).withMessage('isRead must be true, false, or all.'),

  validate,
];

// ─── Update rule body ────────────────────────────────────────────────────────
const updateRuleValidator = [
  body('isEnabled')
    .optional()
    .isBoolean().withMessage('isEnabled must be a boolean.'),

  body('config')
    .optional()
    .isObject().withMessage('config must be an object.'),

  body('recipients')
    .optional()
    .isObject().withMessage('recipients must be an object.'),

  body('channels')
    .optional()
    .isObject().withMessage('channels must be an object.'),

  body('templates')
    .optional()
    .isObject().withMessage('templates must be an object.'),

  validate,
];

module.exports = {
  listNotificationsValidator,
  updateRuleValidator,
};
