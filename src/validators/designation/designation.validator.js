const { body, validationResult } = require('express-validator');
const { LEVELS } = require('../../models/Designation');

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

const createDesignationValidator = [
  body('name')
    .trim().notEmpty().withMessage('Name is required.')
    .isLength({ max: 100 }).withMessage('Name must be under 100 characters.'),
  body('description')
    .optional({ nullable: true }).trim()
    .isLength({ max: 500 }).withMessage('Description must be under 500 characters.'),
  body('level')
    .notEmpty().withMessage('Level is required.')
    .isIn(LEVELS).withMessage(`Level must be one of: ${LEVELS.join(', ')}.`),
  body('department_id')
    .optional({ nullable: true })
    .customSanitizer((v) => (v === '' ? null : v))
    .if((value) => value != null)
    .isMongoId().withMessage('Invalid department ID.'),
  validate,
];

const updateDesignationValidator = [
  body('name')
    .optional().trim().notEmpty().withMessage('Name cannot be empty.')
    .isLength({ max: 100 }).withMessage('Name must be under 100 characters.'),
  body('description')
    .optional({ nullable: true }).trim()
    .isLength({ max: 500 }).withMessage('Description must be under 500 characters.'),
  body('level')
    .optional()
    .isIn(LEVELS).withMessage(`Level must be one of: ${LEVELS.join(', ')}.`),
  body('department_id')
    .optional({ nullable: true })
    .customSanitizer((v) => (v === '' ? null : v))
    .if((value) => value != null)
    .isMongoId().withMessage('Invalid department ID.'),
  validate,
];

module.exports = { createDesignationValidator, updateDesignationValidator };
