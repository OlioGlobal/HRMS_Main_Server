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
  body('shiftType')
    .optional()
    .isIn(['fixed', 'flexible', 'night']).withMessage('Shift type must be fixed, flexible, or night.'),

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

  body('graceMinutes')
    .optional()
    .isInt({ min: 0, max: 60 }).withMessage('Grace minutes must be 0–60.'),

  body('lateMarkAfterMinutes')
    .optional()
    .isInt({ min: 0, max: 120 }).withMessage('Late mark must be 0–120 minutes.'),

  body('halfDayThresholdHours')
    .optional()
    .isFloat({ min: 1, max: 6 }).withMessage('Half day threshold must be 1–6 hours.'),

  body('absentThresholdHours')
    .optional()
    .isFloat({ min: 0.5, max: 4 }).withMessage('Absent threshold must be 0.5–4 hours.'),

  body('overtimeThresholdHours')
    .optional()
    .isFloat({ min: 4, max: 16 }).withMessage('Overtime threshold must be 4–16 hours.'),

  body('isDefault')
    .optional()
    .isBoolean().withMessage('isDefault must be true or false.'),
];

// ─── Create — name and location_id required ───────────────────────────────────
const createWorkPolicyValidator = [
  body('name')
    .trim().notEmpty().withMessage('Policy name is required.')
    .isLength({ min: 2, max: 100 }).withMessage('Name must be 2–100 characters.'),

  body('location_id')
    .notEmpty().withMessage('Location is required.')
    .isMongoId().withMessage('Invalid location ID.'),

  ...sharedRules,
  validate,
];

// ─── Update — all fields optional ─────────────────────────────────────────────
const updateWorkPolicyValidator = [
  body('name')
    .optional().trim()
    .notEmpty().withMessage('Name cannot be empty.')
    .isLength({ min: 2, max: 100 }).withMessage('Name must be 2–100 characters.'),

  body('location_id')
    .optional()
    .isMongoId().withMessage('Invalid location ID.'),

  ...sharedRules,
  validate,
];

module.exports = { createWorkPolicyValidator, updateWorkPolicyValidator };
