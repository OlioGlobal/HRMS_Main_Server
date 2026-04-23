const mongoose = require('mongoose');

const generatedLetterSchema = new mongoose.Schema(
  {
    company_id: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Company',
      required: true,
      index:    true,
    },

    employee_id: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Employee',
      required: true,
      index:    true,
    },

    template_id: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'LetterTemplate',
      default: null,
    },

    letterType: { type: String, required: true },

    // Pipeline context (null for on-demand letters)
    pipeline_id:  { type: mongoose.Schema.Types.ObjectId, ref: 'HiringPipeline', default: null },
    pipelineStep: { type: Number, default: null },

    // Final HTML with all auto-variables resolved
    // Manual variable slots left for HR to fill before PDF
    resolvedContent: { type: String, default: '' },

    // What HR filled for manual variables at generation time
    manualInputs: { type: mongoose.Schema.Types.Mixed, default: {} },

    // PDF stored in B2
    pdfUrl: { type: String, default: null },
    pdfKey: { type: String, default: null },

    status: {
      type:    String,
      enum:    ['draft', 'sent', 'accepted', 'declined'],
      default: 'draft',
    },

    // Candidate acceptance details
    requiresAcceptance: { type: Boolean, default: true },
    acceptedByName:     { type: String, default: null },
    acceptedAt:         { type: Date,   default: null },
    acceptComment:      { type: String, default: null },
    declinedAt:         { type: Date,   default: null },
    declineReason:      { type: String, default: null },

    sentAt:      { type: Date,   default: null },
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

generatedLetterSchema.index({ company_id: 1, employee_id: 1, status: 1 });
generatedLetterSchema.index({ company_id: 1, letterType: 1 });

module.exports = mongoose.model('GeneratedLetter', generatedLetterSchema);
