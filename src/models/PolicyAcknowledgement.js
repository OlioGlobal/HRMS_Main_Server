const mongoose = require('mongoose');

const policyAcknowledgementSchema = new mongoose.Schema(
  {
    company_id: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Company',
      required: true,
      index:    true,
    },
    policy_document_id: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'PolicyDocument',
      required: true,
    },
    employee_id: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Employee',
      required: true,
    },
    acknowledgedAt: {
      type:    Date,
      default: Date.now,
    },
    ipAddress: {
      type:    String,
      default: null,
    },
  },
  { timestamps: true }
);

// Prevent double acknowledgement
policyAcknowledgementSchema.index(
  { policy_document_id: 1, employee_id: 1 },
  { unique: true }
);

module.exports = mongoose.model('PolicyAcknowledgement', policyAcknowledgementSchema);
