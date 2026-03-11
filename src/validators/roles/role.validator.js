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

const createRoleValidator = [
  body('name')
    .trim().notEmpty().withMessage('Role name is required.')
    .isLength({ min: 2, max: 50 }).withMessage('Name must be 2–50 characters.'),

  body('description')
    .optional().trim()
    .isLength({ max: 200 }).withMessage('Description must be under 200 characters.'),

  body('level')
    .optional()
    .isInt({ min: 2, max: 100 }).withMessage('Level must be an integer between 2 and 100.'),

  validate,
];

const updateRoleValidator = [
  body('name')
    .optional().trim()
    .isLength({ min: 2, max: 50 }).withMessage('Name must be 2–50 characters.'),

  body('description')
    .optional().trim()
    .isLength({ max: 200 }).withMessage('Description must be under 200 characters.'),

  body('level')
    .optional()
    .isInt({ min: 2, max: 100 }).withMessage('Level must be an integer between 2 and 100.'),

  validate,
];

const updatePermissionsValidator = [
  body('permissions')
    .isArray().withMessage('permissions must be an array.'),

  body('permissions.*.permissionId')
    .notEmpty().withMessage('permissionId is required for each entry.'),

  body('permissions.*.scope')
    .isIn(['global', 'department', 'team', 'self'])
    .withMessage('scope must be one of: global, department, team, self.'),

  validate,
];

const assignRoleValidator = [
  body('roleId')
    .notEmpty().withMessage('roleId is required.'),

  validate,
];

module.exports = {
  createRoleValidator,
  updateRoleValidator,
  updatePermissionsValidator,
  assignRoleValidator,
};
