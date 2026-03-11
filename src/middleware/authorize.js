const UserRole       = require('../models/UserRole');
const RolePermission = require('../models/RolePermission');
const Permission     = require('../models/Permission');
const AppError       = require('../utils/AppError');
const catchAsync     = require('../utils/catchAsync');

// ─── authorize(module, action) ─────────────────────────────────────────────────
// Usage:  router.get('/...', authenticate, authorize('leave_requests', 'approve'), handler)
// Effect: throws 403 if user lacks the permission; attaches req.permissionScope for handlers.
const authorize = (module, action) =>
  catchAsync(async (req, _res, next) => {
    const { userId, companyId } = req.user; // set by authenticate middleware

    // 1. Get all roles the user holds in this company
    const userRoles = await UserRole.find({ user_id: userId, company_id: companyId }).lean();
    if (!userRoles.length) {
      throw new AppError('Access denied. No roles assigned to your account.', 403);
    }

    // 2. Look up the requested permission
    const permission = await Permission.findOne({ module, action }).lean();
    if (!permission) {
      throw new AppError(`Permission '${module}:${action}' is not defined in the system.`, 403);
    }

    // 3. Check whether any of the user's roles grant this permission
    const roleIds = userRoles.map((ur) => ur.role_id);
    const granted = await RolePermission.findOne({
      role_id:       { $in: roleIds },
      permission_id: permission._id,
    }).lean();

    if (!granted) {
      throw new AppError('You do not have permission to perform this action.', 403);
    }

    // 4. Attach scope so route handlers can apply data filters
    req.permissionScope = granted.scope; // 'global' | 'department' | 'team' | 'self'
    next();
  });

module.exports = authorize;
