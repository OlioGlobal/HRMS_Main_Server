const roleService    = require('../../services/roles/role.service');
const catchAsync     = require('../../utils/catchAsync');
const { sendSuccess } = require('../../utils/response');

// GET /api/roles
const listRoles = catchAsync(async (req, res) => {
  const roles = await roleService.listRoles(req.user.companyId);
  sendSuccess(res, { status: 200, message: 'Roles fetched.', data: { roles } });
});

// GET /api/roles/:id
const getRole = catchAsync(async (req, res) => {
  const role = await roleService.getRole(req.params.id, req.user.companyId);
  sendSuccess(res, { status: 200, message: 'Role fetched.', data: { role } });
});

// POST /api/roles
const createRole = catchAsync(async (req, res) => {
  const { name, description, level } = req.body;
  const role = await roleService.createRole(req.user.companyId, { name, description, level });
  sendSuccess(res, { status: 201, message: 'Role created.', data: { role } });
});

// PATCH /api/roles/:id
const updateRole = catchAsync(async (req, res) => {
  const role = await roleService.updateRole(req.params.id, req.user.companyId, req.body);
  sendSuccess(res, { status: 200, message: 'Role updated.', data: { role } });
});

// DELETE /api/roles/:id
const deleteRole = catchAsync(async (req, res) => {
  await roleService.deleteRole(req.params.id, req.user.companyId);
  sendSuccess(res, { status: 200, message: 'Role deleted.' });
});

// GET /api/roles/:id/permissions
const getRolePermissions = catchAsync(async (req, res) => {
  const permissions = await roleService.getRolePermissions(req.params.id, req.user.companyId);
  sendSuccess(res, { status: 200, message: 'Role permissions fetched.', data: { permissions } });
});

// PUT /api/roles/:id/permissions
const updateRolePermissions = catchAsync(async (req, res) => {
  const { permissions } = req.body; // [{ permissionId, scope }]
  const updated = await roleService.updateRolePermissions(
    req.params.id, req.user.companyId, permissions
  );
  sendSuccess(res, { status: 200, message: 'Role permissions updated.', data: { permissions: updated } });
});

// GET /api/users/:userId/roles
const getUserRoles = catchAsync(async (req, res) => {
  const roles = await roleService.getUserRoles(req.params.userId, req.user.companyId);
  sendSuccess(res, { status: 200, message: 'User roles fetched.', data: { roles } });
});

// POST /api/users/:userId/roles
const assignRole = catchAsync(async (req, res) => {
  const { roleId } = req.body;
  const userRole = await roleService.assignRole(
    req.params.userId, roleId, req.user.companyId, req.user.userId
  );
  sendSuccess(res, { status: 201, message: 'Role assigned.', data: { userRole } });
});

// DELETE /api/users/:userId/roles/:roleId
const revokeRole = catchAsync(async (req, res) => {
  await roleService.revokeRole(req.params.userId, req.params.roleId, req.user.companyId);
  sendSuccess(res, { status: 200, message: 'Role revoked.' });
});

module.exports = {
  listRoles, getRole, createRole, updateRole, deleteRole,
  getRolePermissions, updateRolePermissions,
  getUserRoles, assignRole, revokeRole,
};
