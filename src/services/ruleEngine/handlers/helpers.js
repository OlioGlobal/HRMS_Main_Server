const Role = require('../../../models/Role');
const UserRole = require('../../../models/UserRole');

/**
 * Find all HR user IDs for a company (role level <= 3: Super Admin, HR Manager, HR Staff)
 */
const findHRUsers = async (companyId) => {
  const hrRoles = await Role.find({ company_id: companyId, level: { $lte: 3 } })
    .select('_id')
    .lean();

  if (!hrRoles.length) return [];

  const userRoles = await UserRole.find({
    role_id: { $in: hrRoles.map((r) => r._id) },
    company_id: companyId,
  })
    .select('user_id')
    .lean();

  const userIds = [...new Set(userRoles.map((ur) => ur.user_id.toString()))];
  return userIds;
};

/**
 * Build a full name from firstName + lastName
 */
const fullName = (doc) =>
  [doc?.firstName, doc?.lastName].filter(Boolean).join(' ') || 'Unknown';

module.exports = { findHRUsers, fullName };
