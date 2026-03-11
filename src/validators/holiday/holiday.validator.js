const { body, query, validationResult } = require('express-validator');
const { TYPES } = require('../../models/PublicHoliday');

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

const createHolidayValidator = [
  body('name').trim().notEmpty().withMessage('Name is required.')
    .isLength({ max: 150 }).withMessage('Name must be under 150 characters.'),
  body('date').notEmpty().withMessage('Date is required.').isISO8601().withMessage('Invalid date format.'),
  body('type').optional().isIn(TYPES).withMessage(`Type must be one of: ${TYPES.join(', ')}.`),
  body('isOptional').optional().isBoolean().withMessage('isOptional must be a boolean.'),
  body('location_id')
    .optional({ nullable: true })
    .customSanitizer((v) => (v === '' ? null : v))
    .if((value) => value != null)
    .isMongoId().withMessage('Invalid location ID.'),
  body('description').optional({ nullable: true }).trim()
    .isLength({ max: 300 }).withMessage('Description must be under 300 characters.'),
  validate,
];

const updateHolidayValidator = [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty.')
    .isLength({ max: 150 }).withMessage('Name must be under 150 characters.'),
  body('date').optional().isISO8601().withMessage('Invalid date format.'),
  body('type').optional().isIn(TYPES).withMessage(`Type must be one of: ${TYPES.join(', ')}.`),
  body('isOptional').optional().isBoolean().withMessage('isOptional must be a boolean.'),
  body('location_id')
    .optional({ nullable: true })
    .customSanitizer((v) => (v === '' ? null : v))
    .if((value) => value != null)
    .isMongoId().withMessage('Invalid location ID.'),
  body('description').optional({ nullable: true }).trim()
    .isLength({ max: 300 }).withMessage('Description must be under 300 characters.'),
  validate,
];

const bulkCreateValidator = [
  body('holidays').isArray({ min: 1 }).withMessage('holidays must be a non-empty array.'),
  body('holidays.*.name').trim().notEmpty().withMessage('Name is required.'),
  body('holidays.*.date').notEmpty().withMessage('Date is required.').isISO8601().withMessage('Invalid date.'),
  validate,
];

const fetchNagerValidator = [
  query('countryCode').trim().notEmpty().withMessage('countryCode is required.')
    .isLength({ min: 2, max: 2 }).withMessage('countryCode must be 2 characters.'),
  query('year').optional().isInt({ min: 2000, max: 2100 }).withMessage('Invalid year.'),
  validate,
];

module.exports = {
  createHolidayValidator,
  updateHolidayValidator,
  bulkCreateValidator,
  fetchNagerValidator,
};
