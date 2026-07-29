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

const BILLING_CYCLES = ['monthly', 'quarterly', 'yearly', 'custom'];

// maxEmployees may be null (unlimited) or an integer >= 0.
const maxEmployeesRule = (v) => {
  if (v === null) return true;
  if (Number.isInteger(v) && v >= 0) return true;
  throw new Error('maxEmployees must be null or an integer >= 0.');
};

const createPlanValidator = [
  body('name')
    .trim().notEmpty().withMessage('Plan name is required.')
    .isLength({ min: 2, max: 60 }).withMessage('Name must be 2–60 characters.'),

  body('description')
    .optional().isString().withMessage('Description must be a string.')
    .isLength({ max: 500 }).withMessage('Description must be at most 500 characters.'),

  body('price')
    .optional().isFloat({ min: 0 }).withMessage('Price must be a number >= 0.'),

  body('currency')
    .optional().isString().withMessage('Currency must be a string.'),

  body('billingCycle')
    .optional().isIn(BILLING_CYCLES).withMessage('Invalid billing cycle.'),

  body('maxEmployees')
    .optional({ nullable: true }).custom(maxEmployeesRule),

  body('features')
    .optional().isArray().withMessage('Features must be an array.'),

  body('isActive')
    .optional().isBoolean().withMessage('isActive must be true or false.'),

  validate,
];

const updatePlanValidator = [
  body('name')
    .optional().trim().notEmpty().withMessage('Plan name cannot be empty.')
    .isLength({ min: 2, max: 60 }).withMessage('Name must be 2–60 characters.'),

  body('description')
    .optional().isString().withMessage('Description must be a string.')
    .isLength({ max: 500 }).withMessage('Description must be at most 500 characters.'),

  body('price')
    .optional().isFloat({ min: 0 }).withMessage('Price must be a number >= 0.'),

  body('currency')
    .optional().isString().withMessage('Currency must be a string.'),

  body('billingCycle')
    .optional().isIn(BILLING_CYCLES).withMessage('Invalid billing cycle.'),

  body('maxEmployees')
    .optional({ nullable: true }).custom(maxEmployeesRule),

  body('features')
    .optional().isArray().withMessage('Features must be an array.'),

  body('isActive')
    .optional().isBoolean().withMessage('isActive must be true or false.'),

  validate,
];

module.exports = { createPlanValidator, updatePlanValidator };
