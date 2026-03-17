const { body, param, validationResult } = require('express-validator');
const { CATEGORIES, WHO_UPLOADS } = require('../../models/DocumentType');
const { POLICY_CATEGORIES }       = require('../../models/PolicyDocument');

// ─── Shared validate middleware ─────────────────────────────────────────────
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      message: 'Validation failed',
      errors:  errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
};

// ─── Document Type ──────────────────────────────────────────────────────────
const createDocumentType = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('category').isIn(CATEGORIES).withMessage(`Category must be one of: ${CATEGORIES.join(', ')}`),
  body('whoUploads').optional().isIn(WHO_UPLOADS).withMessage(`whoUploads must be one of: ${WHO_UPLOADS.join(', ')}`),
  body('isRequired').optional().isBoolean(),
  body('expiryTracking').optional().isBoolean(),
  body('expiryAlertDays').optional().isInt({ min: 1 }).withMessage('Must be a positive integer'),
  body('allowedFormats').optional().isArray(),
  body('maxFileSizeMB').optional().isFloat({ min: 1, max: 100 }).withMessage('Must be between 1-100'),
  validate,
];

const updateDocumentType = [
  param('id').isMongoId().withMessage('Invalid ID'),
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('category').optional().isIn(CATEGORIES),
  body('whoUploads').optional().isIn(WHO_UPLOADS),
  body('isRequired').optional().isBoolean(),
  body('expiryTracking').optional().isBoolean(),
  body('expiryAlertDays').optional().isInt({ min: 1 }),
  body('allowedFormats').optional().isArray(),
  body('maxFileSizeMB').optional().isFloat({ min: 1, max: 100 }),
  body('isActive').optional().isBoolean(),
  validate,
];

// ─── Employee Document Upload ───────────────────────────────────────────────
const requestUploadUrl = [
  param('employeeId').isMongoId().withMessage('Invalid employee ID'),
  body('documentTypeId').isMongoId().withMessage('Invalid document type ID'),
  body('fileName').trim().notEmpty().withMessage('File name is required'),
  body('mimeType').trim().notEmpty().withMessage('MIME type is required'),
  body('fileSize').isInt({ min: 1 }).withMessage('File size must be positive'),
  validate,
];

const confirmUpload = [
  param('employeeId').isMongoId().withMessage('Invalid employee ID'),
  body('documentTypeId').isMongoId().withMessage('Invalid document type ID'),
  body('name').trim().notEmpty().withMessage('Document name is required'),
  body('fileKey').trim().notEmpty().withMessage('File key is required'),
  body('fileSize').optional().isInt({ min: 0 }),
  body('mimeType').optional().trim(),
  body('expiryDate').optional({ nullable: true }).isISO8601().withMessage('Invalid date'),
  validate,
];

// Self-service upload (no employeeId param — resolved from auth)
const confirmSelfUpload = [
  body('documentTypeId').isMongoId().withMessage('Invalid document type ID'),
  body('name').trim().notEmpty().withMessage('Document name is required'),
  body('fileKey').trim().notEmpty().withMessage('File key is required'),
  body('fileSize').optional().isInt({ min: 0 }),
  body('mimeType').optional().trim(),
  body('expiryDate').optional({ nullable: true }).isISO8601().withMessage('Invalid date'),
  validate,
];

const rejectDocument = [
  param('docId').isMongoId().withMessage('Invalid document ID'),
  body('reason').trim().notEmpty().withMessage('Rejection reason is required'),
  validate,
];

// ─── Policy Document ────────────────────────────────────────────────────────
const requestPolicyUploadUrl = [
  body('category').isIn(POLICY_CATEGORIES).withMessage(`Category must be one of: ${POLICY_CATEGORIES.join(', ')}`),
  body('fileName').trim().notEmpty().withMessage('File name is required'),
  body('mimeType').trim().notEmpty().withMessage('MIME type is required'),
  validate,
];

const createPolicy = [
  body('name').trim().notEmpty().withMessage('Policy name is required'),
  body('category').isIn(POLICY_CATEGORIES).withMessage(`Invalid category`),
  body('description').optional().trim(),
  body('fileKey').trim().notEmpty().withMessage('File key is required'),
  body('fileSize').optional().isInt({ min: 0 }),
  body('mimeType').optional().trim(),
  body('requiresAcknowledgement').optional().isBoolean(),
  body('acknowledgementDeadline').optional({ nullable: true }).isISO8601(),
  validate,
];

const updatePolicy = [
  param('id').isMongoId().withMessage('Invalid ID'),
  body('name').optional().trim().notEmpty(),
  body('category').optional().isIn(POLICY_CATEGORIES),
  body('description').optional().trim(),
  body('requiresAcknowledgement').optional().isBoolean(),
  body('acknowledgementDeadline').optional({ nullable: true }).isISO8601(),
  body('isActive').optional().isBoolean(),
  validate,
];

const newVersion = [
  param('id').isMongoId().withMessage('Invalid ID'),
  body('fileKey').trim().notEmpty().withMessage('File key is required'),
  body('fileSize').optional().isInt({ min: 0 }),
  body('mimeType').optional().trim(),
  body('versionNotes').optional().trim(),
  body('description').optional().trim(),
  body('requiresAcknowledgement').optional().isBoolean(),
  body('acknowledgementDeadline').optional({ nullable: true }).isISO8601(),
  validate,
];

module.exports = {
  createDocumentType,
  updateDocumentType,
  requestUploadUrl,
  confirmUpload,
  confirmSelfUpload,
  rejectDocument,
  requestPolicyUploadUrl,
  createPolicy,
  updatePolicy,
  newVersion,
};
