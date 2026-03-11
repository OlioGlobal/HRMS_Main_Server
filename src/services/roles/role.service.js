const Role           = require('../../models/Role');
const Permission     = require('../../models/Permission');
const RolePermission = require('../../models/RolePermission');
const UserRole       = require('../../models/UserRole');
const AppError       = require('../../utils/AppError');
const slugify        = require('../../utils/slugify');

// ─── List all roles for a company (with counts) ────────────────────────────────
const listRoles = async (companyId) => {
  const roles = await Role.find({ company_id: companyId }).sort({ level: 1 }).lean();

  const roleIds = roles.map((r) => r._id);

  const [permCounts, userCounts] = await Promise.all([
    RolePermission.aggregate([
      { $match: { role_id: { $in: roleIds } } },
      { $group: { _id: '$role_id', count: { $sum: 1 } } },
    ]),
    UserRole.aggregate([
      { $match: { role_id: { $in: roleIds } } },
      { $group: { _id: '$role_id', count: { $sum: 1 } } },
    ]),
  ]);

  const permCountMap = Object.fromEntries(permCounts.map((p) => [p._id.toString(), p.count]));
  const userCountMap = Object.fromEntries(userCounts.map((u) => [u._id.toString(), u.count]));

  return roles.map((role) => ({
    ...role,
    permissionCount: permCountMap[role._id.toString()] ?? 0,
    userCount:       userCountMap[role._id.toString()] ?? 0,
  }));
};

// ─── Get single role ───────────────────────────────────────────────────────────
const getRole = async (roleId, companyId) => {
  const role = await Role.findOne({ _id: roleId, company_id: companyId }).lean();
  if (!role) throw new AppError('Role not found.', 404);
  return role;
};

// ─── Create custom role ────────────────────────────────────────────────────────
const createRole = async (companyId, { name, description, level }) => {
  let slug = slugify(name);
  const slugExists = await Role.findOne({ company_id: companyId, slug });
  if (slugExists) slug = `${slug}-${Date.now()}`;

  const role = await Role.create({
    company_id:  companyId,
    name,
    slug,
    description: description || '',
    level:       level ?? 10,
    isSystem:    false,
    isActive:    true,
  });

  return role;
};

// ─── Update custom role (name / description / level) ──────────────────────────
const updateRole = async (roleId, companyId, { name, description, level }) => {
  const role = await Role.findOne({ _id: roleId, company_id: companyId });
  if (!role) throw new AppError('Role not found.', 404);
  if (role.isSystem) throw new AppError('System roles cannot be renamed or re-levelled.', 403);

  if (name && name !== role.name) {
    let slug = slugify(name);
    const conflict = await Role.findOne({ company_id: companyId, slug, _id: { $ne: roleId } });
    if (conflict) slug = `${slug}-${Date.now()}`;
    role.name = name;
    role.slug = slug;
  }
  if (description !== undefined) role.description = description;
  if (level       !== undefined) role.level       = level;

  await role.save();
  return role;
};

// ─── Delete custom role ────────────────────────────────────────────────────────
const deleteRole = async (roleId, companyId) => {
  const role = await Role.findOne({ _id: roleId, company_id: companyId });
  if (!role) throw new AppError('Role not found.', 404);
  if (role.isSystem) throw new AppError('System roles cannot be deleted.', 403);

  const userCount = await UserRole.countDocuments({ role_id: roleId });
  if (userCount > 0) {
    throw new AppError(`Cannot delete — ${userCount} user(s) are assigned to this role.`, 409);
  }

  await RolePermission.deleteMany({ role_id: roleId });
  await role.deleteOne();
};

// ─── Get permissions for a role ────────────────────────────────────────────────
const getRolePermissions = async (roleId, companyId) => {
  const role = await Role.findOne({ _id: roleId, company_id: companyId }).lean();
  if (!role) throw new AppError('Role not found.', 404);

  const rps = await RolePermission.find({ role_id: roleId })
    .populate('permission_id', 'module action description')
    .lean();

  return rps.map((rp) => ({
    permissionId: rp.permission_id._id,
    module:       rp.permission_id.module,
    action:       rp.permission_id.action,
    description:  rp.permission_id.description,
    scope:        rp.scope,
  }));
};

// ─── Bulk replace role permissions ────────────────────────────────────────────
// permissions: [{ permissionId, scope }]
const updateRolePermissions = async (roleId, companyId, permissions) => {
  const role = await Role.findOne({ _id: roleId, company_id: companyId });
  if (!role) throw new AppError('Role not found.', 404);

  // Block editing Super Admin to prevent lockout
  if (role.level === 1) throw new AppError('Super Admin permissions cannot be modified.', 403);

  // Validate all permissionIds exist in DB
  if (permissions.length > 0) {
    const permIds     = permissions.map((p) => p.permissionId);
    const foundPerms  = await Permission.find({ _id: { $in: permIds } }).lean();
    if (foundPerms.length !== permIds.length) {
      throw new AppError('One or more permission IDs are invalid.', 400);
    }
  }

  // Replace atomically: delete all, then insert new
  await RolePermission.deleteMany({ role_id: roleId });

  if (permissions.length > 0) {
    const entries = permissions.map((p) => ({
      role_id:       roleId,
      permission_id: p.permissionId,
      scope:         p.scope,
    }));
    await RolePermission.insertMany(entries);
  }

  return getRolePermissions(roleId, companyId);
};

// ─── Get user's roles in a company ────────────────────────────────────────────
const getUserRoles = async (userId, companyId) => {
  const userRoles = await UserRole.find({ user_id: userId, company_id: companyId })
    .populate('role_id', 'name slug level isSystem')
    .lean();
  return userRoles;
};

// ─── Assign role to user ───────────────────────────────────────────────────────
const assignRole = async (userId, roleId, companyId, assignedBy) => {
  const role = await Role.findOne({ _id: roleId, company_id: companyId }).lean();
  if (!role) throw new AppError('Role not found.', 404);

  const existing = await UserRole.findOne({ user_id: userId, role_id: roleId, company_id: companyId });
  if (existing) throw new AppError('User already has this role.', 409);

  const userRole = await UserRole.create({
    user_id:    userId,
    role_id:    roleId,
    company_id: companyId,
    assignedBy,
  });

  return userRole.populate('role_id', 'name slug level');
};

// ─── Revoke role from user ─────────────────────────────────────────────────────
const revokeRole = async (userId, roleId, companyId) => {
  const userRole = await UserRole.findOne({ user_id: userId, role_id: roleId, company_id: companyId });
  if (!userRole) throw new AppError('User does not have this role.', 404);
  await userRole.deleteOne();
};

module.exports = {
  listRoles, getRole, createRole, updateRole, deleteRole,
  getRolePermissions, updateRolePermissions,
  getUserRoles, assignRole, revokeRole,
};
