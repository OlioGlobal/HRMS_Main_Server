const { body, validationResult } = require('express-validator');
const { LETTER_TYPES, CATEGORIES } = require('../../models/LetterTemplate');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      message: 'Validation failed.',
      errors:  errors.array().map(e => ({ field: e.path, message: e.msg })),
    });
  }
  next();
};

const createLetterTemplateValidator = [
  body('name').trim().notEmpty().withMessage('Template name is required.')
    .isLength({ min: 2, max: 150 }).withMessage('Name must be 2–150 characters.'),

  body('letterType').notEmpty().withMessage('Letter type is required.')
    .isIn(LETTER_TYPES).withMessage(`Letter type must be one of: ${LETTER_TYPES.join(', ')}.`),

  body('category').optional()
    .isIn(CATEGORIES).withMessage(`Category must be one of: ${CATEGORIES.join(', ')}.`),

  body('content').optional({ nullable: true }),

  body('manualVariables').optional().isArray().withMessage('manualVariables must be an array.'),
  body('manualVariables.*.key').optional().trim().notEmpty().withMessage('Variable key is required.'),
  body('manualVariables.*.label').optional().trim().notEmpty().withMessage('Variable label is required.'),
  body('manualVariables.*.inputType').optional()
    .isIn(['text', 'date', 'richtext', 'number']).withMessage('Invalid input type.'),

  body('signatoryName').optional({ nullable: true }).trim(),
  body('signatoryTitle').optional({ nullable: true }).trim(),
  body('signatoryEmail').optional({ nullable: true }).isEmail().withMessage('Invalid signatory email.'),
  body('isDefault').optional().isBoolean().withMessage('isDefault must be boolean.'),
  validate,
];

const updateLetterTemplateValidator = [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty.')
    .isLength({ min: 2, max: 150 }).withMessage('Name must be 2–150 characters.'),

  body('category').optional()
    .isIn(CATEGORIES).withMessage(`Category must be one of: ${CATEGORIES.join(', ')}.`),

  body('content').optional({ nullable: true }),

  body('manualVariables').optional().isArray().withMessage('manualVariables must be an array.'),
  body('signatoryName').optional({ nullable: true }).trim(),
  body('signatoryTitle').optional({ nullable: true }).trim(),
  body('signatoryEmail').optional({ nullable: true }).isEmail().withMessage('Invalid signatory email.'),
  body('isDefault').optional().isBoolean().withMessage('isDefault must be boolean.'),
  validate,
];

module.exports = { createLetterTemplateValidator, updateLetterTemplateValidator };
