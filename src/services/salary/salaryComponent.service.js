const SalaryComponent = require('../../models/SalaryComponent');
const AppError        = require('../../utils/AppError');

// ─── List ─────────────────────────────────────────────────────────────────────
const listComponents = async (companyId, { includeInactive } = {}) => {
  const filter = { company_id: companyId };
  if (!includeInactive) filter.isActive = true;
  return SalaryComponent.find(filter)
    .populate('percentOf', 'name')
    .sort({ order: 1, createdAt: 1 })
    .lean();
};

// ─── Get One ──────────────────────────────────────────────────────────────────
const getComponent = async (companyId, id) => {
  const comp = await SalaryComponent.findOne({ _id: id, company_id: companyId })
    .populate('percentOf', 'name')
    .lean();
  if (!comp) throw new AppError('Salary component not found.', 404);
  return comp;
};

// ─── Create ───────────────────────────────────────────────────────────────────
const createComponent = async (companyId, body) => {
  if (body.calcType === 'percentage' && !body.percentOf) {
    throw new AppError('percentOf is required when calcType is percentage.', 400);
  }
  if (body.calcType === 'fixed') body.percentOf = null;

  const comp = await SalaryComponent.create({ ...body, company_id: companyId });
  return comp.toObject();
};

// ─── Update ───────────────────────────────────────────────────────────────────
const updateComponent = async (companyId, id, body) => {
  const comp = await SalaryComponent.findOne({ _id: id, company_id: companyId });
  if (!comp) throw new AppError('Salary component not found.', 404);

  if (body.calcType === 'percentage' && !body.percentOf && !comp.percentOf) {
    throw new AppError('percentOf is required when calcType is percentage.', 400);
  }
  if (body.calcType === 'fixed') body.percentOf = null;

  Object.assign(comp, body);
  await comp.save();
  return comp.toObject();
};

// ─── Delete (soft) ────────────────────────────────────────────────────────────
const deleteComponent = async (companyId, id) => {
  const comp = await SalaryComponent.findOne({ _id: id, company_id: companyId });
  if (!comp) throw new AppError('Salary component not found.', 404);

  comp.isActive = false;
  await comp.save();
  return comp.toObject();
};

module.exports = {
  listComponents,
  getComponent,
  createComponent,
  updateComponent,
  deleteComponent,
};
