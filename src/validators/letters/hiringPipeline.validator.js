const { body, validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      message: 'Validation failed.',
      errors:  errors.array().map(e => ({ field: e.path, message: e.msg })),
    });
  }
  next();
};

const createPipelineValidator = [
  body('name').trim().notEmpty().withMessage('Pipeline name is required.')
    .isLength({ min: 2, max: 100 }).withMessage('Name must be 2–100 characters.'),

  body('steps').optional().isArray().withMessage('Steps must be an array.'),
  body('steps.*.name').optional().trim().notEmpty().withMessage('Step name is required.'),
  body('steps.*.letterType').optional().trim().notEmpty().withMessage('Letter type is required.'),
  body('steps.*.template_id').optional({ nullable: true }).isMongoId().withMessage('Invalid template ID.'),
  body('steps.*.setStatusTo').optional({ nullable: true })
    .isIn(['pre_join', 'offered', 'accepted', 'active']).withMessage('Invalid status.'),
  body('steps.*.requiresAcceptance').optional().isBoolean(),
  body('isDefault').optional().isBoolean(),
  validate,
];

const updatePipelineValidator = [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty.')
    .isLength({ min: 2, max: 100 }).withMessage('Name must be 2–100 characters.'),
  body('steps').optional().isArray().withMessage('Steps must be an array.'),
  body('isDefault').optional().isBoolean(),
  validate,
];

const assignPipelineValidator = [
  body('pipeline_id').notEmpty().isMongoId().withMessage('Valid pipeline ID is required.'),
  validate,
];

module.exports = { createPipelineValidator, updatePipelineValidator, assignPipelineValidator };
