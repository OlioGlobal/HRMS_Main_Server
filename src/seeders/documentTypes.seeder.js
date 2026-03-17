const DocumentType = require('../models/DocumentType');
const slugify = require('../utils/slugify');

const DEFAULT_DOC_TYPES = [
  // ── Company Issued ────────────────────────────────────────────────
  { name: 'Offer Letter',       category: 'company_issued',     whoUploads: 'hr',       isRequired: true,  allowedFormats: ['pdf'],                       maxFileSizeMB: 10 },
  { name: 'Appointment Letter', category: 'company_issued',     whoUploads: 'hr',       isRequired: false, allowedFormats: ['pdf'],                       maxFileSizeMB: 10 },
  { name: 'Increment Letter',   category: 'company_issued',     whoUploads: 'hr',       isRequired: false, allowedFormats: ['pdf'],                       maxFileSizeMB: 10 },
  { name: 'Experience Letter',  category: 'company_issued',     whoUploads: 'hr',       isRequired: false, allowedFormats: ['pdf'],                       maxFileSizeMB: 10 },
  { name: 'Warning Letter',     category: 'company_issued',     whoUploads: 'hr',       isRequired: false, allowedFormats: ['pdf'],                       maxFileSizeMB: 10 },

  // ── Employee Submitted ────────────────────────────────────────────
  { name: 'ID Proof',           category: 'employee_submitted', whoUploads: 'employee', isRequired: true,  allowedFormats: ['pdf', 'jpg', 'jpeg', 'png'], maxFileSizeMB: 5  },
  { name: 'Address Proof',      category: 'employee_submitted', whoUploads: 'employee', isRequired: true,  allowedFormats: ['pdf', 'jpg', 'jpeg', 'png'], maxFileSizeMB: 5  },
  { name: 'Educational Cert',   category: 'employee_submitted', whoUploads: 'employee', isRequired: false, allowedFormats: ['pdf', 'jpg', 'jpeg', 'png'], maxFileSizeMB: 5  },
  { name: 'Bank Details',       category: 'employee_submitted', whoUploads: 'employee', isRequired: true,  allowedFormats: ['pdf', 'jpg', 'jpeg', 'png'], maxFileSizeMB: 5  },
  { name: 'PAN Card',           category: 'employee_submitted', whoUploads: 'employee', isRequired: true,  allowedFormats: ['pdf', 'jpg', 'jpeg', 'png'], maxFileSizeMB: 5  },
  { name: 'Passport',           category: 'employee_submitted', whoUploads: 'both',     isRequired: false, allowedFormats: ['pdf', 'jpg', 'jpeg', 'png'], maxFileSizeMB: 5,  expiryTracking: true, expiryAlertDays: 90 },
  { name: 'Work Permit / Visa', category: 'employee_submitted', whoUploads: 'both',     isRequired: false, allowedFormats: ['pdf', 'jpg', 'jpeg', 'png'], maxFileSizeMB: 5,  expiryTracking: true, expiryAlertDays: 60 },
];

/**
 * Seed default document types for a company (called during signup).
 * Idempotent — duplicates are silently skipped via unique index on {company_id, slug}.
 */
const seedDefaultDocumentTypes = async (companyId) => {
  const docs = DEFAULT_DOC_TYPES.map((dt) => ({
    company_id:      companyId,
    slug:            slugify(dt.name),
    isActive:        true,
    expiryTracking:  false,
    expiryAlertDays: 30,
    ...dt,
  }));

  try {
    const result = await DocumentType.insertMany(docs, { ordered: false, rawResult: true });
    const inserted = result.insertedCount ?? 0;
    if (inserted > 0) {
      console.log(`[DocumentTypes] ${inserted} default document types seeded for company ${companyId}.`);
    }
  } catch (err) {
    if (err.code === 11000 || err.name === 'MongoBulkWriteError') {
      // duplicates — expected on re-runs
    } else {
      throw err;
    }
  }
};

module.exports = { seedDefaultDocumentTypes, DEFAULT_DOC_TYPES };
