const mongoose = require('mongoose');

const STATUSES = ['pending', 'verified', 'rejected', 'expired'];

const employeeDocumentSchema = new mongoose.Schema(
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
    document_type_id: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'DocumentType',
      required: true,
    },
    name: {
      type:     String,
      required: true,
      trim:     true,
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
    expiryDate: {
      type:    Date,
      default: null,
    },

    // ─── Verification ──────────────────────────────────────────────
    status: {
      type:    String,
      enum:    STATUSES,
      default: 'pending',
    },
    verifiedBy: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'User',
      default: null,
    },
    verifiedAt: {
      type:    Date,
      default: null,
    },
    rejectionReason: {
      type:    String,
      default: null,
    },

    // ─── Access ────────────────────────────────────────────────────
    isVisibleToEmployee: {
      type:    Boolean,
      default: true,
    },
    uploadedBy: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
    },

    // Set when this document was mapped from a generated/signed letter (shares its
    // B2 object). Deleting such a doc must NOT delete the file — the letter owns it.
    sourceLetter_id: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'GeneratedLetter',
      default: null,
    },
  },
  { timestamps: true }
);

employeeDocumentSchema.index({ company_id: 1, employee_id: 1, document_type_id: 1 });
employeeDocumentSchema.index({ company_id: 1, expiryDate: 1 });

module.exports          = mongoose.model('EmployeeDocument', employeeDocumentSchema);
module.exports.STATUSES = STATUSES;
