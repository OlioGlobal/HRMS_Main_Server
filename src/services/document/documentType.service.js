const DocumentType       = require('../../models/DocumentType');
const EmployeeDocument   = require('../../models/EmployeeDocument');
const AppError           = require('../../utils/AppError');
const slugify            = require('../../utils/slugify');

// ─── List ────────────────────────────────────────────────────────────────────
const listDocumentTypes = async (companyId, filters = {}) => {
  const query = { company_id: companyId, isActive: true };
  if (filters.category) query.category = filters.category;
  if (filters.isRequired !== undefined) query.isRequired = filters.isRequired === 'true';

  const types = await DocumentType.find(query).sort({ category: 1, name: 1 }).lean();
  return types;
};

// ─── Get one ─────────────────────────────────────────────────────────────────
const getDocumentType = async (companyId, id) => {
  const dt = await DocumentType.findOne({ _id: id, company_id: companyId }).lean();
  if (!dt) throw new AppError('Document type not found', 404);
  return dt;
};

// ─── Create ──────────────────────────────────────────────────────────────────
const createDocumentType = async (companyId, data) => {
  const slug = slugify(data.name);
  const exists = await DocumentType.findOne({ company_id: companyId, slug });
  if (exists) throw new AppError('A document type with this name already exists', 409);

  const dt = await DocumentType.create({ ...data, company_id: companyId, slug });
  return dt;
};

// ─── Update ──────────────────────────────────────────────────────────────────
const updateDocumentType = async (companyId, id, data) => {
  const dt = await DocumentType.findOne({ _id: id, company_id: companyId });
  if (!dt) throw new AppError('Document type not found', 404);

  if (data.name && data.name !== dt.name) {
    const slug = slugify(data.name);
    const exists = await DocumentType.findOne({ company_id: companyId, slug, _id: { $ne: id } });
    if (exists) throw new AppError('A document type with this name already exists', 409);
    data.slug = slug;
  }

  Object.assign(dt, data);
  await dt.save();
  return dt;
};

// ─── Delete ──────────────────────────────────────────────────────────────────
const deleteDocumentType = async (companyId, id) => {
  const dt = await DocumentType.findOne({ _id: id, company_id: companyId });
  if (!dt) throw new AppError('Document type not found', 404);

  const docCount = await EmployeeDocument.countDocuments({ document_type_id: id });
  if (docCount > 0) {
    throw new AppError(`Cannot delete — ${docCount} document(s) use this type. Deactivate instead.`, 400);
  }

  await DocumentType.deleteOne({ _id: id });
  return { deleted: true };
};

module.exports = {
  listDocumentTypes,
  getDocumentType,
  createDocumentType,
  updateDocumentType,
  deleteDocumentType,
};
