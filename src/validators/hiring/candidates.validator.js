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

// ─── Create ───────────────────────────────────────────────────────────────────

const createCandidateValidator = [
  body('firstName')
    .notEmpty().withMessage('First name is required.')
    .trim()
    .isLength({ max: 100 }).withMessage('First name too long.'),

  body('lastName')
    .notEmpty().withMessage('Last name is required.')
    .trim()
    .isLength({ max: 100 }).withMessage('Last name too long.'),

  body('personalEmail')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isEmail().withMessage('Invalid email address.'),

  body('phone')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 20 }).withMessage('Phone must be under 20 characters.'),

  body('roughGross')
    .optional({ nullable: true })
    .isFloat({ min: 0 }).withMessage('Rough gross must be a positive number.'),

  body('joiningDate')
    .optional({ nullable: true })
    .isISO8601().withMessage('Invalid joining date.'),

  body('pipeline_id')
    .optional({ nullable: true })
    .customSanitizer((v) => (v === '' ? null : v))
    .if((v) => v != null)
    .isMongoId().withMessage('Invalid pipeline ID.'),

  body('designation_id')
    .optional({ nullable: true })
    .customSanitizer((v) => (v === '' ? null : v))
    .if((v) => v != null)
    .isMongoId().withMessage('Invalid designation ID.'),

  body('location_id')
    .optional({ nullable: true })
    .customSanitizer((v) => (v === '' ? null : v))
    .if((v) => v != null)
    .isMongoId().withMessage('Invalid location ID.'),

  body('department_id')
    .optional({ nullable: true })
    .customSanitizer((v) => (v === '' ? null : v))
    .if((v) => v != null)
    .isMongoId().withMessage('Invalid department ID.'),

  validate,
];

// ─── Update ───────────────────────────────────────────────────────────────────

const updateCandidateValidator = [
  body('firstName')
    .optional()
    .trim()
    .notEmpty().withMessage('First name cannot be empty.')
    .isLength({ max: 100 }).withMessage('First name too long.'),

  body('lastName')
    .optional()
    .trim()
    .notEmpty().withMessage('Last name cannot be empty.')
    .isLength({ max: 100 }).withMessage('Last name too long.'),

  body('personalEmail')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isEmail().withMessage('Invalid email address.'),

  body('email')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isEmail().withMessage('Invalid work email address.'),

  body('phone')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 20 }).withMessage('Phone must be under 20 characters.'),

  body('gender')
    .optional({ nullable: true })
    .isIn(['male', 'female', 'other', 'prefer_not_to_say'])
    .withMessage('Invalid gender value.'),

  body('dateOfBirth')
    .optional({ nullable: true })
    .isISO8601().withMessage('Invalid date of birth.'),

  body('joiningDate')
    .optional({ nullable: true })
    .isISO8601().withMessage('Invalid joining date.'),

  body('roughGross')
    .optional({ nullable: true })
    .isFloat({ min: 0 }).withMessage('Rough gross must be a positive number.'),

  body('employmentType')
    .optional()
    .isIn(['full_time', 'part_time', 'contract', 'intern'])
    .withMessage('Invalid employment type.'),

  body('noticePeriodDays')
    .optional({ nullable: true })
    .isInt({ min: 0 }).withMessage('Notice period must be a non-negative integer.'),

  body('designation_id')
    .optional({ nullable: true })
    .customSanitizer((v) => (v === '' ? null : v))
    .if((v) => v != null)
    .isMongoId().withMessage('Invalid designation ID.'),

  body('department_id')
    .optional({ nullable: true })
    .customSanitizer((v) => (v === '' ? null : v))
    .if((v) => v != null)
    .isMongoId().withMessage('Invalid department ID.'),

  body('location_id')
    .optional({ nullable: true })
    .customSanitizer((v) => (v === '' ? null : v))
    .if((v) => v != null)
    .isMongoId().withMessage('Invalid location ID.'),

  body('team_id')
    .optional({ nullable: true })
    .customSanitizer((v) => (v === '' ? null : v))
    .if((v) => v != null)
    .isMongoId().withMessage('Invalid team ID.'),

  body('workPolicy_id')
    .optional({ nullable: true })
    .customSanitizer((v) => (v === '' ? null : v))
    .if((v) => v != null)
    .isMongoId().withMessage('Invalid work policy ID.'),

  body('reportingManager_id')
    .optional({ nullable: true })
    .customSanitizer((v) => (v === '' ? null : v))
    .if((v) => v != null)
    .isMongoId().withMessage('Invalid reporting manager ID.'),

  body('leaveTemplate_id')
    .optional({ nullable: true })
    .customSanitizer((v) => (v === '' ? null : v))
    .if((v) => v != null)
    .isMongoId().withMessage('Invalid leave template ID.'),

  body('pipeline_id')
    .optional({ nullable: true })
    .customSanitizer((v) => (v === '' ? null : v))
    .if((v) => v != null)
    .isMongoId().withMessage('Invalid pipeline ID.'),

  validate,
];

module.exports = { createCandidateValidator, updateCandidateValidator };
