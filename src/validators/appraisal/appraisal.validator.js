const { body, validationResult } = require('express-validator');
const { TYPES, SCOPES } = require('../../models/AppraisalCycle');

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

// ─── Cycles ──────────────────────────────────────────────────────────────────

const createCycleValidator = [
  body('name').trim().notEmpty().withMessage('Name is required.')
    .isLength({ max: 150 }).withMessage('Name must be under 150 characters.'),
  body('type').notEmpty().withMessage('Type is required.')
    .isIn(TYPES).withMessage(`Type must be one of: ${TYPES.join(', ')}.`),
  body('periodStart').notEmpty().withMessage('Period start is required.').isISO8601(),
  body('periodEnd').notEmpty().withMessage('Period end is required.').isISO8601(),
  body('reviewStart').notEmpty().withMessage('Review start is required.').isISO8601(),
  body('reviewEnd').notEmpty().withMessage('Review end is required.').isISO8601(),
  body('selfRatingDeadline').notEmpty().withMessage('Self rating deadline is required.').isISO8601(),
  body('managerRatingDeadline').notEmpty().withMessage('Manager rating deadline is required.').isISO8601(),
  body('selfRatingWeight').optional().isInt({ min: 0, max: 100 }),
  body('managerRatingWeight').optional().isInt({ min: 0, max: 100 }),
  body('ratingScale').optional().isIn([5, 10]),
  body('minGoals').optional().isInt({ min: 1 }),
  body('maxGoals').optional().isInt({ min: 1 }),
  body('applicableTo').optional().isIn(SCOPES),
  body('department_ids').optional().isArray(),
  body('employee_ids').optional().isArray(),
  body('template_id').optional({ nullable: true }).isMongoId(),
  validate,
];

const updateCycleValidator = [
  body('name').optional().trim().notEmpty().isLength({ max: 150 }),
  body('type').optional().isIn(TYPES),
  body('periodStart').optional().isISO8601(),
  body('periodEnd').optional().isISO8601(),
  body('reviewStart').optional().isISO8601(),
  body('reviewEnd').optional().isISO8601(),
  body('selfRatingDeadline').optional().isISO8601(),
  body('managerRatingDeadline').optional().isISO8601(),
  body('selfRatingWeight').optional().isInt({ min: 0, max: 100 }),
  body('managerRatingWeight').optional().isInt({ min: 0, max: 100 }),
  body('ratingScale').optional().isIn([5, 10]),
  body('minGoals').optional().isInt({ min: 1 }),
  body('maxGoals').optional().isInt({ min: 1 }),
  body('applicableTo').optional().isIn(SCOPES),
  body('department_ids').optional().isArray(),
  body('employee_ids').optional().isArray(),
  body('template_id').optional({ nullable: true }).isMongoId(),
  validate,
];

// ─── Goals ───────────────────────────────────────────────────────────────────

const createGoalValidator = [
  body('title').trim().notEmpty().withMessage('Title is required.')
    .isLength({ max: 200 }).withMessage('Title must be under 200 characters.'),
  body('description').optional({ nullable: true }).trim().isLength({ max: 1000 }),
  body('weightage').notEmpty().withMessage('Weightage is required.')
    .isInt({ min: 1, max: 100 }).withMessage('Weightage must be between 1 and 100.'),
  validate,
];

const updateGoalValidator = [
  body('title').optional().trim().notEmpty().isLength({ max: 200 }),
  body('description').optional({ nullable: true }).trim().isLength({ max: 1000 }),
  body('weightage').optional().isInt({ min: 1, max: 100 }),
  validate,
];

// ─── Ratings ─────────────────────────────────────────────────────────────────

const selfRatingValidator = [
  body('goalRatings').isArray({ min: 1 }).withMessage('Goal ratings are required.'),
  body('goalRatings.*.goalId').notEmpty().isMongoId().withMessage('Invalid goal ID.'),
  body('goalRatings.*.rating').notEmpty().isInt({ min: 1 }).withMessage('Rating is required.'),
  body('goalRatings.*.comment').optional({ nullable: true }).trim().isLength({ max: 500 }),
  body('selfComments').optional({ nullable: true }).trim().isLength({ max: 1000 }),
  validate,
];

const managerRatingValidator = [
  body('goalRatings').isArray({ min: 1 }).withMessage('Goal ratings are required.'),
  body('goalRatings.*.goalId').notEmpty().isMongoId().withMessage('Invalid goal ID.'),
  body('goalRatings.*.rating').notEmpty().isInt({ min: 1 }).withMessage('Rating is required.'),
  body('goalRatings.*.comment').optional({ nullable: true }).trim().isLength({ max: 500 }),
  body('managerComments').optional({ nullable: true }).trim().isLength({ max: 1000 }),
  validate,
];

// ─── Templates ───────────────────────────────────────────────────────────────

const createTemplateValidator = [
  body('name').trim().notEmpty().withMessage('Name is required.')
    .isLength({ max: 100 }).withMessage('Name must be under 100 characters.'),
  body('description').optional({ nullable: true }).trim().isLength({ max: 300 }),
  body('goals').isArray({ min: 1 }).withMessage('At least one goal is required.'),
  body('goals.*.title').trim().notEmpty().withMessage('Goal title is required.'),
  body('goals.*.defaultWeightage').notEmpty().isInt({ min: 1, max: 100 }),
  validate,
];

const updateTemplateValidator = [
  body('name').optional().trim().notEmpty().isLength({ max: 100 }),
  body('description').optional({ nullable: true }).trim().isLength({ max: 300 }),
  body('goals').optional().isArray({ min: 1 }),
  body('goals.*.title').optional().trim().notEmpty(),
  body('goals.*.defaultWeightage').optional().isInt({ min: 1, max: 100 }),
  validate,
];

// ─── Finalize / Reject ───────────────────────────────────────────────────────

const finalizeValidator = [
  body('hrComments').optional({ nullable: true }).trim().isLength({ max: 1000 }),
  validate,
];

const rejectGoalsValidator = [
  body('reason').optional({ nullable: true }).trim().isLength({ max: 500 }),
  validate,
];

const assignReviewerValidator = [
  body('reviewer_id').notEmpty().withMessage('Reviewer ID is required.').isMongoId(),
  validate,
];

module.exports = {
  createCycleValidator, updateCycleValidator,
  createGoalValidator, updateGoalValidator,
  selfRatingValidator, managerRatingValidator,
  createTemplateValidator, updateTemplateValidator,
  finalizeValidator, rejectGoalsValidator, assignReviewerValidator,
};
