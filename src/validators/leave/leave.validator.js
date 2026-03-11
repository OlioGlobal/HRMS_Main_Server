const { body, validationResult } = require('express-validator');
const { LEAVE_KINDS, RESET_CYCLES, GENDERS } = require('../../models/LeaveType');

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

// ─── Leave Type validators ──────────────────────────────────────────────────
const createLeaveTypeValidator = [
  body('name').trim().notEmpty().withMessage('Name is required.')
    .isLength({ max: 100 }).withMessage('Max 100 characters.'),
  body('code').trim().notEmpty().withMessage('Code is required.')
    .isLength({ max: 10 }).withMessage('Max 10 characters.'),
  body('type').optional().isIn(LEAVE_KINDS).withMessage(`Type must be: ${LEAVE_KINDS.join(', ')}.`),
  body('daysPerYear').notEmpty().withMessage('Days per year is required.').isFloat({ min: 0 }).withMessage('Must be >= 0.'),
  body('resetCycle').optional().isIn(RESET_CYCLES).withMessage(`Must be: ${RESET_CYCLES.join(', ')}.`),
  body('carryForward').optional().isBoolean(),
  body('maxCarryForwardDays').optional().isInt({ min: 0 }),
  body('proRateForNewJoiners').optional().isBoolean(),
  body('applicableGender').optional().isIn(GENDERS).withMessage(`Must be: ${GENDERS.join(', ')}.`),
  body('requiresDocument').optional().isBoolean(),
  body('minDaysNotice').optional().isInt({ min: 0 }),
  body('maxDaysAtOnce').optional().isInt({ min: 1 }),
  body('allowHalfDay').optional().isBoolean(),
  body('countWeekends').optional().isBoolean(),
  body('countHolidays').optional().isBoolean(),
  validate,
];

const updateLeaveTypeValidator = [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty.')
    .isLength({ max: 100 }).withMessage('Max 100 characters.'),
  body('code').optional().trim().notEmpty().withMessage('Code cannot be empty.')
    .isLength({ max: 10 }).withMessage('Max 10 characters.'),
  body('type').optional().isIn(LEAVE_KINDS),
  body('daysPerYear').optional().isFloat({ min: 0 }),
  body('resetCycle').optional().isIn(RESET_CYCLES),
  body('carryForward').optional().isBoolean(),
  body('maxCarryForwardDays').optional().isInt({ min: 0 }),
  body('proRateForNewJoiners').optional().isBoolean(),
  body('applicableGender').optional().isIn(GENDERS),
  body('requiresDocument').optional().isBoolean(),
  body('minDaysNotice').optional().isInt({ min: 0 }),
  body('maxDaysAtOnce').optional().isInt({ min: 1 }),
  body('allowHalfDay').optional().isBoolean(),
  body('countWeekends').optional().isBoolean(),
  body('countHolidays').optional().isBoolean(),
  validate,
];

// ─── Leave Template validators ──────────────────────────────────────────────
const createTemplateValidator = [
  body('name').trim().notEmpty().withMessage('Name is required.')
    .isLength({ max: 100 }).withMessage('Max 100 characters.'),
  body('description').optional({ nullable: true }).trim()
    .isLength({ max: 300 }).withMessage('Max 300 characters.'),
  body('leaveTypes').isArray({ min: 1 }).withMessage('At least one leave type is required.'),
  body('leaveTypes.*.leaveType_id').isMongoId().withMessage('Invalid leave type ID.'),
  body('leaveTypes.*.daysOverride').optional({ nullable: true }).isFloat({ min: 0 }),
  body('isDefault').optional().isBoolean(),
  validate,
];

const updateTemplateValidator = [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty.')
    .isLength({ max: 100 }).withMessage('Max 100 characters.'),
  body('description').optional({ nullable: true }).trim()
    .isLength({ max: 300 }).withMessage('Max 300 characters.'),
  body('leaveTypes').optional().isArray({ min: 1 }),
  body('leaveTypes.*.leaveType_id').optional().isMongoId(),
  body('leaveTypes.*.daysOverride').optional({ nullable: true }).isFloat({ min: 0 }),
  body('isDefault').optional().isBoolean(),
  validate,
];

const assignTemplateValidator = [
  body('employeeIds').isArray({ min: 1 }).withMessage('At least one employee ID is required.'),
  body('employeeIds.*').isMongoId().withMessage('Invalid employee ID.'),
  validate,
];

// ─── Leave Request validators ───────────────────────────────────────────────
const applyLeaveValidator = [
  body('leaveType_id').isMongoId().withMessage('Leave type is required.'),
  body('startDate').notEmpty().withMessage('Start date is required.').isISO8601(),
  body('endDate').notEmpty().withMessage('End date is required.').isISO8601(),
  body('isHalfDay').optional().isBoolean(),
  body('halfDaySession').optional().isIn(['morning', 'afternoon']),
  body('reason').optional({ nullable: true }).trim()
    .isLength({ max: 500 }).withMessage('Max 500 characters.'),
  validate,
];

const reviewValidator = [
  body('reviewNote').optional({ nullable: true }).trim()
    .isLength({ max: 300 }).withMessage('Max 300 characters.'),
  validate,
];

// ─── Balance adjustment validator ───────────────────────────────────────────
const adjustBalanceValidator = [
  body('adjustment').notEmpty().withMessage('Adjustment value is required.')
    .isFloat().withMessage('Must be a number.'),
  body('adjustmentNote').optional({ nullable: true }).trim()
    .isLength({ max: 200 }).withMessage('Max 200 characters.'),
  validate,
];

module.exports = {
  createLeaveTypeValidator,
  updateLeaveTypeValidator,
  createTemplateValidator,
  updateTemplateValidator,
  assignTemplateValidator,
  applyLeaveValidator,
  reviewValidator,
  adjustBalanceValidator,
};
