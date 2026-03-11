const Team       = require('../../models/Team');
const Department = require('../../models/Department');
const Employee   = require('../../models/Employee');
const AppError   = require('../../utils/AppError');
const slugify    = require('../../utils/slugify');

// ─── List teams ────────────────────────────────────────────────────────────────
const listTeams = async (companyId, filters = {}) => {
  const query = { company_id: companyId, isActive: true };
  if (filters.department_id) query.department_id = filters.department_id;

  return Team.find(query)
    .populate('department_id', 'name slug')
    .sort({ name: 1 })
    .lean();
};

// ─── Get single team ───────────────────────────────────────────────────────────
const getTeam = async (companyId, id) => {
  const team = await Team.findOne({ _id: id, company_id: companyId })
    .populate('department_id', 'name slug')
    .lean();
  if (!team) throw new AppError('Team not found.', 404);
  return team;
};

// ─── Create team ───────────────────────────────────────────────────────────────
const createTeam = async (companyId, body) => {
  const { name, department_id, description = null } = body;

  // Validate department
  const dept = await Department.findOne({ _id: department_id, company_id: companyId, isActive: true });
  if (!dept) throw new AppError('Department not found.', 404);

  const slug = await _uniqueSlug(companyId, name);
  const team = await Team.create({ company_id: companyId, name, slug, department_id, description });
  return team.toObject();
};

// ─── Update team ───────────────────────────────────────────────────────────────
const updateTeam = async (companyId, id, body) => {
  const team = await Team.findOne({ _id: id, company_id: companyId, isActive: true });
  if (!team) throw new AppError('Team not found.', 404);

  const { name, department_id, description } = body;

  if (department_id !== undefined) {
    const dept = await Department.findOne({ _id: department_id, company_id: companyId, isActive: true });
    if (!dept) throw new AppError('Department not found.', 404);
    team.department_id = department_id;
  }

  if (name && name !== team.name) {
    team.slug = await _uniqueSlug(companyId, name, id);
    team.name = name;
  }
  if (description !== undefined) team.description = description;

  await team.save();
  return (await team.populate('department_id', 'name slug')).toObject();
};

// ─── Delete team ───────────────────────────────────────────────────────────────
const deleteTeam = async (companyId, id) => {
  const team = await Team.findOne({ _id: id, company_id: companyId, isActive: true });
  if (!team) throw new AppError('Team not found.', 404);

  // Block if employees are assigned
  const empCount = await Employee.countDocuments({ team_id: id, company_id: companyId, isActive: true });
  if (empCount > 0) {
    throw new AppError(
      `Cannot delete — ${empCount} employee${empCount > 1 ? 's are' : ' is'} in this team. Reassign them first.`,
      400
    );
  }

  team.isActive = false;
  await team.save();
};

// ─── Helpers ───────────────────────────────────────────────────────────────────
async function _uniqueSlug(companyId, name, excludeId = null) {
  let base  = slugify(name);
  let slug  = base;
  let count = 1;
  const query = { company_id: companyId, slug };
  if (excludeId) query._id = { $ne: excludeId };
  while (await Team.exists(query)) {
    slug = `${base}-${count++}`;
    query.slug = slug;
  }
  return slug;
}

module.exports = { listTeams, getTeam, createTeam, updateTeam, deleteTeam };
