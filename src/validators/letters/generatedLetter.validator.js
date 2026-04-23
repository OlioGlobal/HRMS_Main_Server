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

const generateLetterValidator = [
  body('employee_id').notEmpty().isMongoId().withMessage('Valid employee ID is required.'),
  body('template_id').notEmpty().isMongoId().withMessage('Valid template ID is required.'),
  body('letterType').optional().trim(),
  body('manualInputs').optional().isObject().withMessage('manualInputs must be an object.'),
  body('pipeline_id').optional({ nullable: true }).isMongoId().withMessage('Invalid pipeline ID.'),
  body('pipelineStep').optional({ nullable: true }).isInt({ min: 1 }).withMessage('Pipeline step must be a positive integer.'),
  body('requiresAcceptance').optional().isBoolean(),
  validate,
];

module.exports = { generateLetterValidator };
