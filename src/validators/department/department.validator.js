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

const createDepartmentValidator = [
  body('name')
    .trim().notEmpty().withMessage('Department name is required.')
    .isLength({ min: 2, max: 100 }).withMessage('Name must be 2–100 characters.'),

  body('parent_id')
    .optional({ nullable: true })
    .isMongoId().withMessage('Invalid parent department ID.'),

  body('description')
    .optional({ nullable: true }).trim()
    .isLength({ max: 300 }).withMessage('Description must be under 300 characters.'),

  validate,
];

const updateDepartmentValidator = [
  body('name')
    .optional().trim().notEmpty().withMessage('Name cannot be empty.')
    .isLength({ min: 2, max: 100 }).withMessage('Name must be 2–100 characters.'),

  body('parent_id')
    .optional({ nullable: true })
    .custom((v) => v === null || /^[a-f\d]{24}$/i.test(v)).withMessage('Invalid parent department ID.'),

  body('description')
    .optional({ nullable: true }).trim()
    .isLength({ max: 300 }).withMessage('Description must be under 300 characters.'),

  validate,
];

module.exports = { createDepartmentValidator, updateDepartmentValidator };
