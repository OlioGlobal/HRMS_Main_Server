const Designation = require('../../models/Designation');
const Employee    = require('../../models/Employee');
const AppError    = require('../../utils/AppError');

// ─── List ─────────────────────────────────────────────────────────────────────
const listDesignations = async (companyId, { department, level } = {}) => {
  const filter = { company_id: companyId, isActive: true };
  if (department) filter.department_id = department;
  if (level) filter.level = level;

  const designations = await Designation.find(filter)
    .populate('department_id', 'name')
    .sort({ name: 1 })
    .lean();

  // Attach employee counts
  const counts = await Employee.aggregate([
    { $match: { company_id: designations[0]?.company_id || companyId, designation_id: { $in: designations.map((d) => d._id) }, isActive: true } },
    { $group: { _id: '$designation_id', count: { $sum: 1 } } },
  ]);
  const countMap = Object.fromEntries(counts.map((c) => [c._id.toString(), c.count]));

  return designations.map((d) => ({
    ...d,
    employeeCount: countMap[d._id.toString()] || 0,
  }));
};

// ─── Get One ──────────────────────────────────────────────────────────────────
const getDesignation = async (companyId, id) => {
  const doc = await Designation.findOne({ _id: id, company_id: companyId })
    .populate('department_id', 'name')
    .lean();
  if (!doc) throw new AppError('Designation not found.', 404);
  return doc;
};

// ─── Create ───────────────────────────────────────────────────────────────────
const createDesignation = async (companyId, body) => {
  const doc = await Designation.create({ ...body, company_id: companyId });
  return doc.toObject();
};

// ─── Update ───────────────────────────────────────────────────────────────────
const updateDesignation = async (companyId, id, body) => {
  const doc = await Designation.findOne({ _id: id, company_id: companyId });
  if (!doc) throw new AppError('Designation not found.', 404);

  Object.assign(doc, body);
  await doc.save();
  return doc.toObject();
};

// ─── Delete (block if assigned) ───────────────────────────────────────────────
const deleteDesignation = async (companyId, id) => {
  const doc = await Designation.findOne({ _id: id, company_id: companyId });
  if (!doc) throw new AppError('Designation not found.', 404);

  const assigned = await Employee.countDocuments({ designation_id: id, isActive: true });
  if (assigned > 0) {
    throw new AppError(`Cannot delete — ${assigned} employee(s) are assigned this designation.`, 400);
  }

  await Designation.deleteOne({ _id: id });
};

module.exports = {
  listDesignations,
  getDesignation,
  createDesignation,
  updateDesignation,
  deleteDesignation,
};
