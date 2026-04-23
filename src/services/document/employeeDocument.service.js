const EmployeeDocument = require('../../models/EmployeeDocument');
const DocumentType     = require('../../models/DocumentType');
const DocumentAuditLog = require('../../models/DocumentAuditLog');
const Employee         = require('../../models/Employee');
const AppError         = require('../../utils/AppError');
const { uploadToB2, getDownloadUrl, deleteFromR2, buildEmployeeDocKey } = require('../../utils/r2');

// ─── Helper: log audit ──────────────────────────────────────────────────────
const _logAudit = async (data) => {
  await DocumentAuditLog.create({ ...data, sourceType: 'employee_document' });
};

// ─── List documents for an employee ─────────────────────────────────────────
const listEmployeeDocuments = async (companyId, employeeId, filters = {}) => {
  const query = { company_id: companyId, employee_id: employeeId, isVisibleToEmployee: true };
  if (filters.category) {
    const typeIds = await DocumentType.find({ company_id: companyId, category: filters.category }).distinct('_id');
    query.document_type_id = { $in: typeIds };
  }
  if (filters.status) query.status = filters.status;

  const docs = await EmployeeDocument.find(query)
    .populate('document_type_id', 'name category whoUploads expiryTracking')
    .populate('uploadedBy', 'firstName lastName')
    .populate('verifiedBy', 'firstName lastName')
    .sort({ createdAt: -1 })
    .lean();

  return docs;
};

// ─── Upload document (multer file → B2 → save record) ──────────────────────
// Combines validation, B2 upload, and DB record creation in one step
const uploadDocument = async (companyId, employeeId, userId, { documentTypeId, expiryDate, file }) => {
  const docType = await DocumentType.findOne({ _id: documentTypeId, company_id: companyId });
  if (!docType) throw new AppError('Document type not found', 404);

  // Validate format
  const ext = file.originalname.split('.').pop().toLowerCase();
  if (!docType.allowedFormats.includes(ext)) {
    throw new AppError(`File format .${ext} not allowed. Allowed: ${docType.allowedFormats.join(', ')}`, 400);
  }

  // Validate size
  const sizeMB = file.size / (1024 * 1024);
  if (sizeMB > docType.maxFileSizeMB) {
    throw new AppError(`File size exceeds ${docType.maxFileSizeMB}MB limit`, 400);
  }

  // Upload to B2
  const fileKey = buildEmployeeDocKey(companyId, employeeId, docType.slug || docType.name, file.originalname);
  await uploadToB2(fileKey, file.buffer, file.mimetype);

  // Archive any existing doc of the same type for this employee
  await EmployeeDocument.updateMany(
    { company_id: companyId, employee_id: employeeId, document_type_id: documentTypeId },
    { $set: { isVisibleToEmployee: false } }
  );

  // Auto-verify if company_issued doc uploaded by HR
  const isCompanyIssued = docType.category === 'company_issued';
  const autoStatus = isCompanyIssued ? 'verified' : 'pending';

  const doc = await EmployeeDocument.create({
    company_id:       companyId,
    employee_id:      employeeId,
    document_type_id: documentTypeId,
    name:             file.originalname,
    fileKey,
    fileSize:         file.size,
    mimeType:         file.mimetype,
    expiryDate:       expiryDate || null,
    uploadedBy:       userId,
    status:           autoStatus,
    verifiedBy:       isCompanyIssued ? userId : null,
    verifiedAt:       isCompanyIssued ? new Date() : null,
  });

  await _logAudit({
    company_id:  companyId,
    document_id: doc._id,
    employee_id: employeeId,
    action:      'uploaded',
    performedBy: userId,
  });

  return doc;
};

// ─── Get presigned download URL ─────────────────────────────────────────────
const getDocumentDownloadUrl = async (companyId, docId, userId) => {
  const doc = await EmployeeDocument.findOne({ _id: docId, company_id: companyId });
  if (!doc) throw new AppError('Document not found', 404);

  const url = await getDownloadUrl(doc.fileKey);

  await _logAudit({
    company_id:  companyId,
    document_id: doc._id,
    employee_id: doc.employee_id,
    action:      'downloaded',
    performedBy: userId,
  });

  return { url, document: doc };
};

// ─── Verify document ────────────────────────────────────────────────────────
const verifyDocument = async (companyId, docId, userId) => {
  const doc = await EmployeeDocument.findOne({ _id: docId, company_id: companyId });
  if (!doc) throw new AppError('Document not found', 404);
  if (doc.status === 'verified') throw new AppError('Document already verified', 400);

  doc.status     = 'verified';
  doc.verifiedBy = userId;
  doc.verifiedAt = new Date();
  doc.rejectionReason = null;
  await doc.save();

  await _logAudit({
    company_id:  companyId,
    document_id: doc._id,
    employee_id: doc.employee_id,
    action:      'verified',
    performedBy: userId,
  });

  return doc;
};

// ─── Bulk verify ────────────────────────────────────────────────────────────
const bulkVerifyDocuments = async (companyId, docIds, userId) => {
  const docs = await EmployeeDocument.find({
    _id:        { $in: docIds },
    company_id: companyId,
    status:     'pending',
  });

  if (docs.length === 0) throw new AppError('No pending documents found', 400);

  const now = new Date();
  await EmployeeDocument.updateMany(
    { _id: { $in: docs.map((d) => d._id) } },
    { $set: { status: 'verified', verifiedBy: userId, verifiedAt: now, rejectionReason: null } }
  );

  // Log audit for each
  const auditEntries = docs.map((d) => ({
    company_id:  companyId,
    document_id: d._id,
    sourceType:  'employee_document',
    employee_id: d.employee_id,
    action:      'verified',
    performedBy: userId,
  }));
  await DocumentAuditLog.insertMany(auditEntries);

  return { verified: docs.length };
};

// ─── Reject document ────────────────────────────────────────────────────────
const rejectDocument = async (companyId, docId, userId, reason) => {
  const doc = await EmployeeDocument.findOne({ _id: docId, company_id: companyId });
  if (!doc) throw new AppError('Document not found', 404);

  doc.status          = 'rejected';
  doc.rejectionReason = reason;
  doc.verifiedBy      = null;
  doc.verifiedAt      = null;
  await doc.save();

  await _logAudit({
    company_id:  companyId,
    document_id: doc._id,
    employee_id: doc.employee_id,
    action:      'rejected',
    performedBy: userId,
  });

  return doc;
};

// ─── Delete document ────────────────────────────────────────────────────────
// FIX #12: Check if employee can only delete own uploads
const deleteDocument = async (companyId, docId, userId, { isEmployeeSelf = false } = {}) => {
  const doc = await EmployeeDocument.findOne({ _id: docId, company_id: companyId });
  if (!doc) throw new AppError('Document not found', 404);

  // Employee can only delete their own uploads
  if (isEmployeeSelf && doc.uploadedBy.toString() !== userId) {
    throw new AppError('You can only delete documents you uploaded', 403);
  }

  // Delete from R2
  try { await deleteFromR2(doc.fileKey); } catch (e) { /* ignore R2 errors on delete */ }

  await _logAudit({
    company_id:  companyId,
    document_id: doc._id,
    employee_id: doc.employee_id,
    action:      'deleted',
    performedBy: userId,
  });

  await EmployeeDocument.deleteOne({ _id: docId });
  return { deleted: true };
};

// ─── Document checklist (required docs status) ──────────────────────────────
const getDocumentChecklist = async (companyId, employeeId) => {
  const requiredTypes = await DocumentType.find({
    company_id: companyId,
    isRequired:  true,
    isActive:    true,
  }).lean();

  const uploaded = await EmployeeDocument.find({
    company_id:  companyId,
    employee_id: employeeId,
  }).sort({ createdAt: -1 }).lean();

  const checklist = requiredTypes.map((type) => {
    const doc = uploaded.find(
      (d) => d.document_type_id.toString() === type._id.toString()
    );
    return {
      documentType:   type.name,
      documentTypeId: type._id,
      category:       type.category,
      whoUploads:     type.whoUploads,
      status:         doc ? doc.status : 'missing',
      documentId:     doc ? doc._id : null,
      rejectionReason: doc ? doc.rejectionReason : null,
    };
  });

  return checklist;
};

// ─── Expiring documents ─────────────────────────────────────────────────────
const getExpiringDocuments = async (companyId, days = 30) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() + days);

  const docs = await EmployeeDocument.find({
    company_id: companyId,
    expiryDate: { $gte: today, $lte: cutoff },
    status:     { $ne: 'expired' },
  })
    .populate('employee_id', 'firstName lastName employeeId')
    .populate('document_type_id', 'name')
    .sort({ expiryDate: 1 })
    .lean();

  return docs.map((d) => ({
    ...d,
    daysLeft: Math.ceil((new Date(d.expiryDate) - today) / (1000 * 60 * 60 * 24)),
  }));
};

// ─── My documents (employee self-service) ───────────────────────────────────
const getMyDocuments = async (companyId, employeeId) => {
  const docs = await EmployeeDocument.find({
    company_id:          companyId,
    employee_id:         employeeId,
    isVisibleToEmployee: true,
  })
    .populate('document_type_id', 'name category whoUploads')
    .populate('uploadedBy', 'firstName lastName')
    .sort({ createdAt: -1 })
    .lean();

  return docs;
};

// ─── Compliance overview (all employees doc completion %) ───────────────────
const getComplianceOverview = async (companyId) => {
  const requiredTypes = await DocumentType.find({
    company_id: companyId,
    isRequired:  true,
    isActive:    true,
  }).lean();

  if (requiredTypes.length === 0) return [];

  const employees = await Employee.find({
    company_id: companyId,
    status:     'active',
  }).select('firstName lastName employeeId').lean();

  const allDocs = await EmployeeDocument.find({
    company_id:       companyId,
    document_type_id: { $in: requiredTypes.map((t) => t._id) },
    isVisibleToEmployee: true,
  }).lean();

  return employees.map((emp) => {
    const empDocs = allDocs.filter((d) => d.employee_id.toString() === emp._id.toString());
    let verified = 0;
    let pending  = 0;
    let missing  = 0;
    let rejected = 0;

    for (const type of requiredTypes) {
      const doc = empDocs.find((d) => d.document_type_id.toString() === type._id.toString());
      if (!doc) missing++;
      else if (doc.status === 'verified') verified++;
      else if (doc.status === 'rejected') rejected++;
      else pending++;
    }

    const total = requiredTypes.length;
    return {
      employee:   emp,
      total,
      verified,
      pending,
      missing,
      rejected,
      completion: total > 0 ? Math.round((verified / total) * 100) : 0,
    };
  });
};

module.exports = {
  listEmployeeDocuments,
  uploadDocument,
  getDocumentDownloadUrl,
  verifyDocument,
  bulkVerifyDocuments,
  rejectDocument,
  deleteDocument,
  getDocumentChecklist,
  getExpiringDocuments,
  getMyDocuments,
  getComplianceOverview,
};
