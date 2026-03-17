const mongoose = require('mongoose');

const POLICY_CATEGORIES = ['hr_policy', 'it_policy', 'code_of_conduct', 'leave_policy', 'other'];

const policyDocumentSchema = new mongoose.Schema(
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
    category: {
      type:     String,
      enum:     POLICY_CATEGORIES,
      required: true,
    },
    description: {
      type:    String,
      default: null,
      trim:    true,
    },
    fileKey: {
      type:     String,
      required: true,
    },
    fileSize: {
      type: Number,
      default: 0,
    },
    mimeType: {
      type: String,
      default: null,
    },

    // ─── Versioning ────────────────────────────────────────────────
    policyGroupId: {
      type:     mongoose.Schema.Types.ObjectId,
      default:  null,
    },
    versionNumber: {
      type:    Number,
      default: 1,
    },
    versionNotes: {
      type:    String,
      default: null,
      trim:    true,
    },
    isLatest: {
      type:    Boolean,
      default: true,
    },

    // ─── Acknowledgement ───────────────────────────────────────────
    requiresAcknowledgement: {
      type:    Boolean,
      default: false,
    },
    acknowledgementDeadline: {
      type:    Date,
      default: null,
    },

    // ─── Status ────────────────────────────────────────────────────
    isActive: {
      type:    Boolean,
      default: true,
    },
    uploadedBy: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
    },
  },
  { timestamps: true }
);

policyDocumentSchema.index({ company_id: 1, isLatest: 1 });
policyDocumentSchema.index({ policyGroupId: 1 });

module.exports                   = mongoose.model('PolicyDocument', policyDocumentSchema);
module.exports.POLICY_CATEGORIES = POLICY_CATEGORIES;
