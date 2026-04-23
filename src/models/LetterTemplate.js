const mongoose = require('mongoose');

const LETTER_TYPES = [
  'interim_offer',
  'appointment',
  'experience',
  'relieving',
  'increment',
  'promotion',
  'confirmation',
  'warning',
  'salary_certificate',
  'noc',
  'custom',
];

const CATEGORIES = ['pre_join', 'employment', 'exit', 'general'];

const manualVariableSchema = new mongoose.Schema({
  key:       { type: String, required: true, trim: true },
  label:     { type: String, required: true, trim: true },
  inputType: { type: String, enum: ['text', 'date', 'richtext', 'number'], default: 'text' },
  required:  { type: Boolean, default: true },
}, { _id: false });

const letterTemplateSchema = new mongoose.Schema(
  {
    company_id: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Company',
      required: true,
      index:    true,
    },

    name:       { type: String, required: true, trim: true },
    letterType: { type: String, required: true, enum: LETTER_TYPES },
    category:   { type: String, required: true, enum: CATEGORIES, default: 'general' },

    // Header HTML (repeats on every printed page)
    headerHtml: { type: String, default: '' },

    // Footer HTML (repeats on every printed page)
    footerHtml: { type: String, default: '' },

    // TipTap HTML content with {{variable.path}} placeholders
    // Use <hr data-type="page-break"> to insert page breaks
    content: { type: String, required: true, default: '' },

    // Variables HR must fill manually at generation time
    manualVariables: { type: [manualVariableSchema], default: [] },

    // Signatory details printed at bottom of letter
    signatoryName:  { type: String, default: null, trim: true },
    signatoryTitle: { type: String, default: null, trim: true },
    signatoryEmail: { type: String, default: null, trim: true },

    // Whether candidate must accept/decline (false = informational only)
    requiresAcceptance: { type: Boolean, default: true },

    // One default template per letterType per company
    isDefault: { type: Boolean, default: false },
    isActive:  { type: Boolean, default: true },

    version:      { type: Number, default: 1 },
    createdBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    lastEditedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

letterTemplateSchema.index({ company_id: 1, letterType: 1, isDefault: 1 });
letterTemplateSchema.index({ company_id: 1, isActive: 1 });

module.exports = mongoose.model('LetterTemplate', letterTemplateSchema);
module.exports.LETTER_TYPES = LETTER_TYPES;
module.exports.CATEGORIES   = CATEGORIES;
