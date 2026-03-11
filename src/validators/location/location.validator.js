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

const DAYS       = ['MON','TUE','WED','THU','FRI','SAT','SUN'];
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

// ─── Shared optional rules ─────────────────────────────────────────────────────
const sharedRules = [
  body('city')
    .optional({ nullable: true }).trim()
    .isLength({ max: 100 }).withMessage('City must be under 100 characters.'),

  body('address')
    .optional({ nullable: true }).trim()
    .isLength({ max: 250 }).withMessage('Address must be under 250 characters.'),

  body('code')
    .optional({ nullable: true }).trim().toUpperCase()
    .isLength({ max: 10 }).withMessage('Code must be under 10 characters.')
    .matches(/^[A-Z0-9_-]*$/).withMessage('Code can only contain letters, numbers, dashes and underscores.'),

  body('isHQ')
    .optional().isBoolean().withMessage('isHQ must be true or false.'),

  body('timezone')
    .optional().trim().notEmpty().withMessage('Timezone cannot be empty.'),

  body('workStart')
    .optional()
    .matches(TIME_REGEX).withMessage('Work start must be in HH:mm format.'),

  body('workEnd')
    .optional()
    .matches(TIME_REGEX).withMessage('Work end must be in HH:mm format.'),

  body('workingDays')
    .optional()
    .isArray({ min: 1 }).withMessage('Working days must have at least 1 day.')
    .custom((arr) => arr.every((d) => DAYS.includes(d))).withMessage('Invalid day value.'),

  body('currency')
    .optional().trim().notEmpty().withMessage('Currency cannot be empty.'),

  body('geofence.lat')
    .optional({ nullable: true })
    .isFloat({ min: -90, max: 90 }).withMessage('Latitude must be between -90 and 90.'),

  body('geofence.lng')
    .optional({ nullable: true })
    .isFloat({ min: -180, max: 180 }).withMessage('Longitude must be between -180 and 180.'),

  body('geofence.radius')
    .optional()
    .isInt({ min: 50, max: 10000 }).withMessage('Radius must be 50–10000 metres.'),
];

// ─── Create — name and country required ───────────────────────────────────────
const createLocationValidator = [
  body('name')
    .trim().notEmpty().withMessage('Location name is required.')
    .isLength({ min: 2, max: 100 }).withMessage('Name must be 2–100 characters.'),

  body('country')
    .trim().notEmpty().withMessage('Country is required.')
    .isLength({ min: 2, max: 100 }).withMessage('Country must be 2–100 characters.'),

  ...sharedRules,
  validate,
];

// ─── Update — all fields optional ─────────────────────────────────────────────
const updateLocationValidator = [
  body('name')
    .optional().trim()
    .notEmpty().withMessage('Name cannot be empty.')
    .isLength({ min: 2, max: 100 }).withMessage('Name must be 2–100 characters.'),

  body('country')
    .optional().trim()
    .notEmpty().withMessage('Country cannot be empty.')
    .isLength({ min: 2, max: 100 }).withMessage('Country must be 2–100 characters.'),

  ...sharedRules,
  validate,
];

module.exports = { createLocationValidator, updateLocationValidator };
