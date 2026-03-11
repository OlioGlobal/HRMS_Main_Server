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

const createTeamValidator = [
  body('name')
    .trim().notEmpty().withMessage('Team name is required.')
    .isLength({ min: 2, max: 100 }).withMessage('Name must be 2–100 characters.'),

  body('department_id')
    .notEmpty().withMessage('Department is required.')
    .isMongoId().withMessage('Invalid department ID.'),

  body('description')
    .optional({ nullable: true }).trim()
    .isLength({ max: 300 }).withMessage('Description must be under 300 characters.'),

  validate,
];

const updateTeamValidator = [
  body('name')
    .optional().trim().notEmpty().withMessage('Name cannot be empty.')
    .isLength({ min: 2, max: 100 }).withMessage('Name must be 2–100 characters.'),

  body('department_id')
    .optional()
    .isMongoId().withMessage('Invalid department ID.'),

  body('description')
    .optional({ nullable: true }).trim()
    .isLength({ max: 300 }).withMessage('Description must be under 300 characters.'),

  validate,
];

module.exports = { createTeamValidator, updateTeamValidator };
