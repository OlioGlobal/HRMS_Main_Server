const { body, validationResult } = require('express-validator');

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

const updateOffboardingChecklistValidator = [
  body('knowledgeTransfer').optional().isBoolean().withMessage('Must be a boolean'),
  body('assetsReturned').optional().isBoolean().withMessage('Must be a boolean'),
  body('exitInterview').optional().isBoolean().withMessage('Must be a boolean'),
  body('accessRevoked').optional().isBoolean().withMessage('Must be a boolean'),
  body('lastWorkingDay').optional({ nullable: true }).isISO8601().withMessage('Must be a valid date'),
  validate,
];

module.exports = { updateOffboardingChecklistValidator };
