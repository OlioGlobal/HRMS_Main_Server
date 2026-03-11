const Department = require('../../models/Department');
const Team       = require('../../models/Team');
const Employee   = require('../../models/Employee');
const AppError   = require('../../utils/AppError');
const slugify    = require('../../utils/slugify');

// ─── List all departments (flat — frontend builds the tree) ────────────────────
const listDepartments = async (companyId) => {
  return Department.find({ company_id: companyId, isActive: true })
    .sort({ name: 1 })
    .lean();
};

// ─── Get single department ─────────────────────────────────────────────────────
const getDepartment = async (companyId, id) => {
  const dept = await Department.findOne({ _id: id, company_id: companyId }).lean();
  if (!dept) throw new AppError('Department not found.', 404);
  return dept;
};

// ─── Create department ─────────────────────────────────────────────────────────
const createDepartment = async (companyId, body) => {
  const { name, parent_id = null, description = null } = body;

  // Validate parent belongs to same company
  if (parent_id) {
    const parent = await Department.findOne({ _id: parent_id, company_id: companyId, isActive: true });
    if (!parent) throw new AppError('Parent department not found.', 404);
  }

  const slug = await _uniqueSlug(companyId, name);
  const dept = await Department.create({ company_id: companyId, name, slug, parent_id, description });
  return dept.toObject();
};

// ─── Update department ─────────────────────────────────────────────────────────
const updateDepartment = async (companyId, id, body) => {
  const dept = await Department.findOne({ _id: id, company_id: companyId, isActive: true });
  if (!dept) throw new AppError('Department not found.', 404);

  const { name, parent_id, description } = body;

  // Prevent cycle: parent cannot be self or a descendant
  if (parent_id !== undefined && parent_id !== null) {
    if (parent_id.toString() === id.toString()) {
      throw new AppError('A department cannot be its own parent.', 400);
    }
    const isDescendant = await _isDescendant(companyId, parent_id, id);
    if (isDescendant) throw new AppError('Cannot set a child department as parent (circular reference).', 400);

    const parent = await Department.findOne({ _id: parent_id, company_id: companyId, isActive: true });
    if (!parent) throw new AppError('Parent department not found.', 404);
  }

  if (name && name !== dept.name) {
    dept.slug = await _uniqueSlug(companyId, name, id);
    dept.name = name;
  }
  if (parent_id !== undefined) dept.parent_id   = parent_id ?? null;
  if (description !== undefined) dept.description = description;

  await dept.save();
  return dept.toObject();
};

// ─── Delete department ─────────────────────────────────────────────────────────
const deleteDepartment = async (companyId, id) => {
  const dept = await Department.findOne({ _id: id, company_id: companyId, isActive: true });
  if (!dept) throw new AppError('Department not found.', 404);

  // Block if has active children
  const childCount = await Department.countDocuments({ parent_id: id, company_id: companyId, isActive: true });
  if (childCount > 0) {
    throw new AppError(
      `Cannot delete — this department has ${childCount} sub-department${childCount > 1 ? 's' : ''}. Remove them first.`,
      400
    );
  }

  // Block if teams exist in this department
  const teamCount = await Team.countDocuments({ department_id: id, company_id: companyId, isActive: true });
  if (teamCount > 0) {
    throw new AppError(
      `Cannot delete — ${teamCount} team${teamCount > 1 ? 's are' : ' is'} in this department. Remove them first.`,
      400
    );
  }

  // Block if employees are assigned
  const empCount = await Employee.countDocuments({ department_id: id, company_id: companyId, isActive: true });
  if (empCount > 0) {
    throw new AppError(
      `Cannot delete — ${empCount} employee${empCount > 1 ? 's are' : ' is'} in this department. Reassign them first.`,
      400
    );
  }

  dept.isActive = false;
  await dept.save();
};

// ─── Helpers ───────────────────────────────────────────────────────────────────
async function _uniqueSlug(companyId, name, excludeId = null) {
  let base   = slugify(name);
  let slug   = base;
  let count  = 1;
  const query = { company_id: companyId, slug };
  if (excludeId) query._id = { $ne: excludeId };
  while (await Department.exists(query)) {
    slug = `${base}-${count++}`;
    query.slug = slug;
  }
  return slug;
}

async function _isDescendant(companyId, targetId, ancestorId) {
  // Walk up the tree from targetId; if we hit ancestorId, it's a descendant
  let current = targetId.toString();
  const visited = new Set();
  while (current) {
    if (visited.has(current)) break;   // cycle guard
    visited.add(current);
    if (current === ancestorId.toString()) return true;
    const dept = await Department.findOne({ _id: current, company_id: companyId }).select('parent_id').lean();
    current = dept?.parent_id?.toString() ?? null;
  }
  return false;
}

module.exports = { listDepartments, getDepartment, createDepartment, updateDepartment, deleteDepartment };
