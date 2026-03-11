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

// ─── Salary Component ────────────────────────────────────────────────────────
const createComponentValidator = [
  body('name')
    .trim().notEmpty().withMessage('Name is required.')
    .isLength({ max: 100 }).withMessage('Name must be under 100 characters.'),
  body('type')
    .notEmpty().withMessage('Type is required.')
    .isIn(['earning', 'deduction']).withMessage('Type must be earning or deduction.'),
  body('calcType')
    .optional()
    .isIn(['fixed', 'percentage']).withMessage('calcType must be fixed or percentage.'),
  body('percentOf')
    .optional({ nullable: true })
    .customSanitizer((v) => (v === '' ? null : v))
    .if((value) => value != null)
    .isMongoId().withMessage('Invalid percentOf ID.'),
  body('defaultValue')
    .optional()
    .isFloat({ min: 0 }).withMessage('defaultValue must be a non-negative number.'),
  body('taxable').optional().isBoolean().withMessage('taxable must be boolean.'),
  body('statutory').optional().isBoolean().withMessage('statutory must be boolean.'),
  body('order').optional().isInt({ min: 0 }).withMessage('order must be a non-negative integer.'),
  validate,
];

const updateComponentValidator = [
  body('name')
    .optional().trim().notEmpty().withMessage('Name cannot be empty.')
    .isLength({ max: 100 }).withMessage('Name must be under 100 characters.'),
  body('type')
    .optional()
    .isIn(['earning', 'deduction']).withMessage('Type must be earning or deduction.'),
  body('calcType')
    .optional()
    .isIn(['fixed', 'percentage']).withMessage('calcType must be fixed or percentage.'),
  body('percentOf')
    .optional({ nullable: true })
    .customSanitizer((v) => (v === '' ? null : v))
    .if((value) => value != null)
    .isMongoId().withMessage('Invalid percentOf ID.'),
  body('defaultValue')
    .optional()
    .isFloat({ min: 0 }).withMessage('defaultValue must be a non-negative number.'),
  body('taxable').optional().isBoolean().withMessage('taxable must be boolean.'),
  body('statutory').optional().isBoolean().withMessage('statutory must be boolean.'),
  body('order').optional().isInt({ min: 0 }).withMessage('order must be a non-negative integer.'),
  validate,
];

// ─── Salary Grade ────────────────────────────────────────────────────────────
const createGradeValidator = [
  body('name')
    .trim().notEmpty().withMessage('Grade name is required.')
    .isLength({ max: 100 }).withMessage('Name must be under 100 characters.'),
  body('minCTC')
    .optional()
    .isFloat({ min: 0 }).withMessage('minCTC must be a non-negative number.'),
  body('maxCTC')
    .optional()
    .isFloat({ min: 0 }).withMessage('maxCTC must be a non-negative number.'),
  body('components')
    .isArray({ min: 1 }).withMessage('At least one component is required.'),
  body('components.*.component_id')
    .notEmpty().withMessage('component_id is required.')
    .isMongoId().withMessage('Invalid component ID.'),
  body('components.*.calcType')
    .notEmpty().withMessage('calcType is required.')
    .isIn(['fixed', 'percentage']).withMessage('calcType must be fixed or percentage.'),
  body('components.*.value')
    .notEmpty().withMessage('value is required.')
    .isFloat({ min: 0 }).withMessage('value must be a non-negative number.'),
  validate,
];

const updateGradeValidator = [
  body('name')
    .optional().trim().notEmpty().withMessage('Grade name cannot be empty.')
    .isLength({ max: 100 }).withMessage('Name must be under 100 characters.'),
  body('minCTC')
    .optional()
    .isFloat({ min: 0 }).withMessage('minCTC must be a non-negative number.'),
  body('maxCTC')
    .optional()
    .isFloat({ min: 0 }).withMessage('maxCTC must be a non-negative number.'),
  body('components')
    .optional()
    .isArray({ min: 1 }).withMessage('At least one component is required.'),
  body('components.*.component_id')
    .optional()
    .isMongoId().withMessage('Invalid component ID.'),
  body('components.*.calcType')
    .optional()
    .isIn(['fixed', 'percentage']).withMessage('calcType must be fixed or percentage.'),
  body('components.*.value')
    .optional()
    .isFloat({ min: 0 }).withMessage('value must be a non-negative number.'),
  validate,
];

// ─── Employee Salary Assignment ──────────────────────────────────────────────
const assignSalaryValidator = [
  body('type')
    .notEmpty().withMessage('Type is required.')
    .isIn(['grade', 'custom']).withMessage('Type must be grade or custom.'),
  body('salaryGrade_id')
    .optional({ nullable: true })
    .customSanitizer((v) => (v === '' ? null : v))
    .if((value) => value != null)
    .isMongoId().withMessage('Invalid salary grade ID.'),
  body('effectiveDate')
    .notEmpty().withMessage('Effective date is required.')
    .isISO8601().withMessage('Invalid effective date.'),
  body('reason')
    .optional().trim()
    .isLength({ max: 200 }).withMessage('Reason must be under 200 characters.'),
  body('components')
    .optional()
    .isArray({ min: 1 }).withMessage('At least one component is required.'),
  body('components.*.component_id')
    .optional()
    .isMongoId().withMessage('Invalid component ID.'),
  body('components.*.calcType')
    .optional()
    .isIn(['fixed', 'percentage']).withMessage('calcType must be fixed or percentage.'),
  body('components.*.value')
    .optional()
    .isFloat({ min: 0 }).withMessage('value must be a non-negative number.'),
  validate,
];

module.exports = {
  createComponentValidator,
  updateComponentValidator,
  createGradeValidator,
  updateGradeValidator,
  assignSalaryValidator,
};
