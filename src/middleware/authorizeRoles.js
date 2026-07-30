const UserRole   = require('../models/UserRole');
const AppError   = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

// ─── authorizeRoles(...slugs) ───────────────────────────────────────────────────
// Role-based gate (as opposed to permission-based `authorize`). Allows the request
// only if the user holds at least one of the given role slugs in their company.
// Usage: router.get('/x', authenticate, authorizeRoles('super-admin', 'hr-manager'), handler)
const authorizeRoles = (...slugs) =>
  catchAsync(async (req, _res, next) => {
    const { userId, companyId } = req.user; // set by authenticate

    const userRoles = await UserRole.find({ user_id: userId, company_id: companyId })
      .populate('role_id', 'slug')
      .lean();

    const allowed = userRoles.some((ur) => slugs.includes(ur.role_id?.slug));
    if (!allowed) {
      throw new AppError('You do not have permission to view this.', 403);
    }

    next();
  });

module.exports = authorizeRoles;
