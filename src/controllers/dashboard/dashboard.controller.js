const dashboardService = require('../../services/dashboard/dashboard.service');
const catchAsync       = require('../../utils/catchAsync');
const { sendSuccess }  = require('../../utils/response');
const UserRole         = require('../../models/UserRole');
const RolePermission   = require('../../models/RolePermission');
const Permission       = require('../../models/Permission');

// GET /api/dashboard/stats
const getStats = catchAsync(async (req, res) => {
  const companyId = req.user.companyId;
  const userId    = req.user.userId;

  // Determine user's highest scope for employees:view
  const userRoles = await UserRole.find({ user_id: userId }).select('role_id').lean();
  const roleIds = userRoles.map(ur => ur.role_id);

  const empViewPerm = await Permission.findOne({ module: 'employees', action: 'view' }).lean();
  let scope = 'self';

  if (empViewPerm && roleIds.length > 0) {
    const rps = await RolePermission.find({
      role_id: { $in: roleIds },
      permission_id: empViewPerm._id,
    }).select('scope').lean();

    const priority = { global: 0, department: 1, team: 2, self: 3 };
    for (const rp of rps) {
      if ((priority[rp.scope] ?? 3) < (priority[scope] ?? 3)) {
        scope = rp.scope;
      }
    }
  }

  const data = await dashboardService.getDashboardStats(companyId, userId, scope);

  sendSuccess(res, {
    status:  200,
    message: 'Dashboard stats fetched.',
    data:    { stats: data },
  });
});

module.exports = { getStats };
