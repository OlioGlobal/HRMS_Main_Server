const mongoose = require('mongoose');

const ACTIONS      = ['viewed', 'downloaded', 'uploaded', 'verified', 'rejected', 'deleted'];
const SOURCE_TYPES = ['employee_document', 'policy_document'];

const documentAuditLogSchema = new mongoose.Schema(
  {
    company_id: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Company',
      required: true,
      index:    true,
    },
    document_id: {
      type:     mongoose.Schema.Types.ObjectId,
      required: true,
    },
    sourceType: {
      type:     String,
      enum:     SOURCE_TYPES,
      required: true,
    },
    employee_id: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'Employee',
      default: null,
    },
    action: {
      type:     String,
      enum:     ACTIONS,
      required: true,
    },
    performedBy: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
    },
    ipAddress: {
      type:    String,
      default: null,
    },
  },
  { timestamps: true }
);

documentAuditLogSchema.index({ company_id: 1, createdAt: -1 });
documentAuditLogSchema.index({ document_id: 1 });

module.exports = mongoose.model('DocumentAuditLog', documentAuditLogSchema);
