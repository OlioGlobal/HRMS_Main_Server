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

const signupValidator = [
  body('companyName').trim().notEmpty().withMessage('Company name is required.')
    .isLength({ min: 2, max: 100 }).withMessage('Company name must be 2–100 characters.'),

  body('firstName').trim().notEmpty().withMessage('First name is required.')
    .isLength({ max: 50 }).withMessage('Max 50 characters.'),

  body('lastName').trim().notEmpty().withMessage('Last name is required.')
    .isLength({ max: 50 }).withMessage('Max 50 characters.'),

  body('email').trim().notEmpty().withMessage('Email is required.')
    .isEmail().withMessage('Invalid email address.').normalizeEmail(),

  body('password').notEmpty().withMessage('Password is required.')
    .isLength({ min: 8 }).withMessage('Minimum 8 characters.')
    .matches(/[A-Z]/).withMessage('At least one uppercase letter.')
    .matches(/[a-z]/).withMessage('At least one lowercase letter.')
    .matches(/[0-9]/).withMessage('At least one number.'),

  body('phone').optional().trim().isMobilePhone().withMessage('Invalid phone number.'),

  validate,
];

const loginValidator = [
  body('email').trim().notEmpty().withMessage('Email is required.')
    .isEmail().withMessage('Invalid email address.').normalizeEmail(),

  body('password').notEmpty().withMessage('Password is required.'),

  validate,
];

module.exports = { signupValidator, loginValidator };
