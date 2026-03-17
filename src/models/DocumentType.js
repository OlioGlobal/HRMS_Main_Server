const mongoose = require('mongoose');

const CATEGORIES    = ['company_issued', 'employee_submitted'];
const WHO_UPLOADS   = ['hr', 'employee', 'both'];
const ALLOWED_FMTS  = ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx', 'xls', 'xlsx'];

const documentTypeSchema = new mongoose.Schema(
  {
    company_id: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Company',
      required: true,
      index:    true,
    },
    name: {
      type:     String,
      required: true,
      trim:     true,
    },
    slug: {
      type:     String,
      required: true,
      trim:     true,
    },
    category: {
      type:     String,
      enum:     CATEGORIES,
      required: true,
    },
    isRequired: {
      type:    Boolean,
      default: false,
    },
    expiryTracking: {
      type:    Boolean,
      default: false,
    },
    expiryAlertDays: {
      type:    Number,
      default: 30,
    },
    whoUploads: {
      type:    String,
      enum:    WHO_UPLOADS,
      default: 'hr',
    },
    allowedFormats: {
      type:    [String],
      default: ['pdf', 'jpg', 'png'],
    },
    maxFileSizeMB: {
      type:    Number,
      default: 10,
    },
    isActive: {
      type:    Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

documentTypeSchema.index({ company_id: 1, slug: 1 }, { unique: true });

module.exports            = mongoose.model('DocumentType', documentTypeSchema);
module.exports.CATEGORIES = CATEGORIES;
module.exports.WHO_UPLOADS = WHO_UPLOADS;
module.exports.ALLOWED_FMTS = ALLOWED_FMTS;
