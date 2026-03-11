const { body, query, validationResult } = require('express-validator');
const { CLOCK_TYPES, ATTENDANCE_STATUSES } = require('../../models/AttendanceRecord');
const { MISSED_TYPES } = require('../../models/RegularizationRequest');

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

// ─── Clock In ────────────────────────────────────────────────────────────────
const clockInValidator = [
  body('lat').optional().isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude.'),
  body('lng').optional().isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude.'),
  body('clockInType').optional().isIn(CLOCK_TYPES).withMessage(`Must be: ${CLOCK_TYPES.join(', ')}.`),
  validate,
];

// ─── Clock Out ───────────────────────────────────────────────────────────────
const clockOutValidator = [
  body('lat').optional().isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude.'),
  body('lng').optional().isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude.'),
  body('clockOutType').optional().isIn(CLOCK_TYPES).withMessage(`Must be: ${CLOCK_TYPES.join(', ')}.`),
  validate,
];

// ─── Override ────────────────────────────────────────────────────────────────
const overrideValidator = [
  body('reason').trim().notEmpty().withMessage('Override reason is required.')
    .isLength({ max: 500 }).withMessage('Max 500 characters.'),
  body('clockInTime').optional().isISO8601().withMessage('Invalid clock-in time.'),
  body('clockOutTime').optional().isISO8601().withMessage('Invalid clock-out time.'),
  body('clockInType').optional().isIn(CLOCK_TYPES).withMessage(`Must be: ${CLOCK_TYPES.join(', ')}.`),
  body('clockOutType').optional().isIn(CLOCK_TYPES).withMessage(`Must be: ${CLOCK_TYPES.join(', ')}.`),
  body('status').optional().isIn(ATTENDANCE_STATUSES).withMessage(`Must be: ${ATTENDANCE_STATUSES.join(', ')}.`),
  validate,
];

// ─── Regularization Submit ───────────────────────────────────────────────────
const regularizationSubmitValidator = [
  body('attendanceId').notEmpty().withMessage('Attendance record ID is required.').isMongoId().withMessage('Invalid ID.'),
  body('missedType').notEmpty().withMessage('Missed type is required.')
    .isIn(MISSED_TYPES).withMessage(`Must be: ${MISSED_TYPES.join(', ')}.`),
  body('requestedClockIn').optional().isISO8601().withMessage('Invalid clock-in time.'),
  body('requestedClockOut').optional().isISO8601().withMessage('Invalid clock-out time.'),
  body('reason').trim().notEmpty().withMessage('Reason is required.')
    .isLength({ max: 500 }).withMessage('Max 500 characters.'),
  validate,
];

// ─── Review (approve/reject) ─────────────────────────────────────────────────
const reviewValidator = [
  body('reviewNote').optional().trim().isLength({ max: 300 }).withMessage('Max 300 characters.'),
  validate,
];

module.exports = {
  clockInValidator,
  clockOutValidator,
  overrideValidator,
  regularizationSubmitValidator,
  reviewValidator,
};
