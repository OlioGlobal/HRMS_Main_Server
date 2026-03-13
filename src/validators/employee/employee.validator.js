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

// ─── Shared optional rules (used in both create + update) ─────────────────────
const sharedRules = [
  body('phone')
    .optional({ nullable: true }).trim()
    .isLength({ max: 20 }).withMessage('Phone must be under 20 characters.'),

  body('dateOfBirth')
    .optional({ nullable: true })
    .isISO8601().withMessage('Invalid date of birth.'),

  body('gender')
    .optional({ nullable: true })
    .isIn(['male', 'female', 'other', 'prefer_not_to_say'])
    .withMessage('Invalid gender value.'),

  body('addresses').optional().isArray({ max: 5 }).withMessage('Max 5 addresses allowed.'),
  body('addresses.*.label').optional().isIn(['home', 'permanent', 'current', 'other']).withMessage('Invalid address label.'),
  body('addresses.*.street').optional({ nullable: true }).trim().isLength({ max: 200 }).withMessage('Street too long.'),
  body('addresses.*.city').optional({ nullable: true }).trim().isLength({ max: 100 }).withMessage('City too long.'),
  body('addresses.*.state').optional({ nullable: true }).trim().isLength({ max: 100 }).withMessage('State too long.'),
  body('addresses.*.country').optional({ nullable: true }).trim().isLength({ max: 100 }).withMessage('Country too long.'),
  body('addresses.*.zip').optional({ nullable: true }).trim().isLength({ max: 20 }).withMessage('Zip too long.'),
  body('addresses.*.lat').optional({ nullable: true }).isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude.'),
  body('addresses.*.lng').optional({ nullable: true }).isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude.'),

  body('emergencyContact.phone')
    .optional({ nullable: true }).trim()
    .isLength({ max: 20 }).withMessage('Emergency phone too long.'),

  body('employmentType')
    .optional()
    .isIn(['full_time', 'part_time', 'contract', 'intern'])
    .withMessage('Invalid employment type.'),

  body('joiningDate')
    .optional()
    .isISO8601().withMessage('Invalid joining date.'),

  body('department_id')
    .optional({ nullable: true })
    .customSanitizer((v) => (v === '' ? null : v))
    .if((value) => value != null)
    .isMongoId().withMessage('Invalid department ID.'),

  body('team_id')
    .optional({ nullable: true })
    .customSanitizer((v) => (v === '' ? null : v))
    .if((value) => value != null)
    .isMongoId().withMessage('Invalid team ID.'),

  body('location_id')
    .optional({ nullable: true })
    .customSanitizer((v) => (v === '' ? null : v))
    .if((value) => value != null)
    .isMongoId().withMessage('Invalid location ID.'),

  body('workPolicy_id')
    .optional({ nullable: true })
    .customSanitizer((v) => (v === '' ? null : v))
    .if((value) => value != null)
    .isMongoId().withMessage('Invalid work policy ID.'),

  body('reportingManager_id')
    .optional({ nullable: true })
    .customSanitizer((v) => (v === '' ? null : v))
    .if((value) => value != null)
    .isMongoId().withMessage('Invalid reporting manager ID.'),

  body('designation_id')
    .optional({ nullable: true })
    .customSanitizer((v) => (v === '' ? null : v))
    .if((value) => value != null)
    .isMongoId().withMessage('Invalid designation ID.'),

  body('role_id')
    .optional({ nullable: true })
    .customSanitizer((v) => (v === '' ? null : v))
    .if((value) => value != null)
    .isMongoId().withMessage('Invalid role ID.'),

  body('leaveTemplate_id')
    .optional({ nullable: true })
    .customSanitizer((v) => (v === '' ? null : v))
    .if((value) => value != null)
    .isMongoId().withMessage('Invalid leave template ID.'),
];

// ─── Create ───────────────────────────────────────────────────────────────────
const createEmployeeValidator = [
  body('firstName')
    .trim().notEmpty().withMessage('First name is required.')
    .isLength({ min: 1, max: 60 }).withMessage('First name must be 1–60 characters.'),

  body('lastName')
    .trim().notEmpty().withMessage('Last name is required.')
    .isLength({ min: 1, max: 60 }).withMessage('Last name must be 1–60 characters.'),

  body('joiningDate')
    .notEmpty().withMessage('Joining date is required.')
    .isISO8601().withMessage('Invalid joining date.'),

  body('email')
    .optional({ nullable: true })
    .trim().isEmail().withMessage('Invalid email address.'),

  body('employeeId')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 20 }).withMessage('Employee ID must be under 20 characters.'),

  body('portalAccess')
    .optional()
    .isBoolean().withMessage('portalAccess must be a boolean.'),

  ...sharedRules,
  validate,
];

// ─── Update ───────────────────────────────────────────────────────────────────
const updateEmployeeValidator = [
  body('firstName')
    .optional().trim().notEmpty().withMessage('First name cannot be empty.')
    .isLength({ min: 1, max: 60 }).withMessage('First name must be 1–60 characters.'),

  body('lastName')
    .optional().trim().notEmpty().withMessage('Last name cannot be empty.')
    .isLength({ min: 1, max: 60 }).withMessage('Last name must be 1–60 characters.'),

  body('email')
    .optional({ nullable: true })
    .trim().isEmail().withMessage('Invalid email address.'),

  ...sharedRules,
  validate,
];

// ─── Change status ────────────────────────────────────────────────────────────
const changeStatusValidator = [
  body('status')
    .notEmpty().withMessage('Status is required.')
    .isIn(['active', 'inactive', 'notice', 'terminated'])
    .withMessage('Invalid status value.'),
  validate,
];

module.exports = { createEmployeeValidator, updateEmployeeValidator, changeStatusValidator };
