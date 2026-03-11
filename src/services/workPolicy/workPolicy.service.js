const WorkPolicy = require('../../models/WorkPolicy');
const Location   = require('../../models/Location');
const Employee   = require('../../models/Employee');
const AppError   = require('../../utils/AppError');

// ─── List all work policies ────────────────────────────────────────────────────
const listWorkPolicies = async (companyId, filters = {}) => {
  const query = { company_id: companyId, isActive: true };
  if (filters.location_id) query.location_id = filters.location_id;

  return WorkPolicy.find(query)
    .populate('location_id', 'name city country')
    .sort({ isDefault: -1, name: 1 })
    .lean();
};

// ─── Get single work policy ────────────────────────────────────────────────────
const getWorkPolicy = async (companyId, id) => {
  const policy = await WorkPolicy.findOne({ _id: id, company_id: companyId })
    .populate('location_id', 'name city country')
    .lean();
  if (!policy) throw new AppError('Work policy not found.', 404);
  return policy;
};

// ─── Create work policy ────────────────────────────────────────────────────────
const createWorkPolicy = async (companyId, body) => {
  const { location_id } = body;

  // Validate location
  const location = await Location.findOne({ _id: location_id, company_id: companyId, isActive: true });
  if (!location) throw new AppError('Location not found.', 404);

  // Check name uniqueness
  const existing = await WorkPolicy.findOne({ company_id: companyId, name: body.name, isActive: true });
  if (existing) throw new AppError('A work policy with this name already exists.', 400);

  // If this is default, unset others
  if (body.isDefault) {
    await WorkPolicy.updateMany({ company_id: companyId, isDefault: true }, { $set: { isDefault: false } });
  }

  const policy = await WorkPolicy.create({ ...body, company_id: companyId });
  return (await policy.populate('location_id', 'name city country')).toObject();
};

// ─── Update work policy ────────────────────────────────────────────────────────
const updateWorkPolicy = async (companyId, id, body) => {
  const policy = await WorkPolicy.findOne({ _id: id, company_id: companyId, isActive: true });
  if (!policy) throw new AppError('Work policy not found.', 404);

  if (body.location_id && body.location_id.toString() !== policy.location_id.toString()) {
    const location = await Location.findOne({ _id: body.location_id, company_id: companyId, isActive: true });
    if (!location) throw new AppError('Location not found.', 404);
  }

  if (body.name && body.name !== policy.name) {
    const existing = await WorkPolicy.findOne({
      company_id: companyId, name: body.name, isActive: true, _id: { $ne: id },
    });
    if (existing) throw new AppError('A work policy with this name already exists.', 400);
  }

  // If setting as default, unset others
  if (body.isDefault && !policy.isDefault) {
    await WorkPolicy.updateMany(
      { company_id: companyId, isDefault: true, _id: { $ne: id } },
      { $set: { isDefault: false } }
    );
  }

  Object.assign(policy, body);
  await policy.save();
  return (await policy.populate('location_id', 'name city country')).toObject();
};

// ─── Delete work policy ────────────────────────────────────────────────────────
const deleteWorkPolicy = async (companyId, id) => {
  const policy = await WorkPolicy.findOne({ _id: id, company_id: companyId, isActive: true });
  if (!policy) throw new AppError('Work policy not found.', 404);

  // Block if employees are assigned
  const empCount = await Employee.countDocuments({ workPolicy_id: id, company_id: companyId, isActive: true });
  if (empCount > 0) {
    throw new AppError(
      `Cannot delete — ${empCount} employee${empCount > 1 ? 's are' : ' is'} assigned to this policy. Reassign them first.`,
      400
    );
  }

  policy.isActive = false;
  await policy.save();
};

module.exports = { listWorkPolicies, getWorkPolicy, createWorkPolicy, updateWorkPolicy, deleteWorkPolicy };
