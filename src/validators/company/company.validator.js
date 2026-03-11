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

const CURRENCIES = [
  'USD','EUR','GBP','INR','AED','SAR','SGD','AUD','CAD','JPY',
  'CNY','HKD','MYR','THB','IDR','PHP','BDT','PKR','LKR','NGN',
  'KES','ZAR','BRL','MXN','COP','CLP','PEN','ARS',
];

const DATE_FORMATS = ['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY', 'DD-MM-YYYY', 'MM-DD-YYYY'];

const DAYS = ['MON','TUE','WED','THU','FRI','SAT','SUN'];

const updateCompanyValidator = [
  body('name')
    .optional().trim().notEmpty().withMessage('Company name cannot be empty.')
    .isLength({ min: 2, max: 100 }).withMessage('Name must be 2–100 characters.'),

  body('website')
    .optional({ nullable: true })
    .trim()
    .custom((v) => {
      if (!v) return true;
      try { new URL(v); return true; } catch { throw new Error('Invalid website URL.'); }
    }),

  body('phone')
    .optional({ nullable: true })
    .trim(),

  body('settings.timezone')
    .optional().trim().notEmpty().withMessage('Timezone cannot be empty.'),

  body('settings.currency')
    .optional()
    .isIn(CURRENCIES).withMessage('Invalid currency code.'),

  body('settings.dateFormat')
    .optional()
    .isIn(DATE_FORMATS).withMessage('Invalid date format.'),

  body('settings.timeFormat')
    .optional()
    .isIn(['12h', '24h']).withMessage('Time format must be 12h or 24h.'),

  body('settings.fiscalYearStart')
    .optional()
    .isInt({ min: 1, max: 12 }).withMessage('Fiscal year start must be 1–12.'),

  body('settings.workWeek')
    .optional()
    .isArray({ min: 1 }).withMessage('Work week must have at least 1 day.')
    .custom((arr) => arr.every((d) => DAYS.includes(d))).withMessage('Invalid day in workWeek.'),

  body('settings.geofencing.enabled')
    .optional()
    .isBoolean().withMessage('Geofencing enabled must be true or false.'),

  body('settings.geofencing.defaultRadius')
    .optional()
    .isInt({ min: 50, max: 10000 }).withMessage('Default radius must be 50–10000 metres.'),

  validate,
];

module.exports = { updateCompanyValidator };
