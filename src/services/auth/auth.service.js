const Company        = require('../../models/Company');
const User           = require('../../models/User');
const Role           = require('../../models/Role');
const UserRole       = require('../../models/UserRole');
const RolePermission = require('../../models/RolePermission');
const AppError       = require('../../utils/AppError');
const slugify        = require('../../utils/slugify');
const { seedDefaultRoles } = require('../../seeders/defaultRoles.seeder');
const { seedDefaultSalaryComponents } = require('../../seeders/salaryComponents.seeder');
const { seedDefaultLeaveTypes }     = require('../../seeders/leaveTypes.seeder');
const { seedDefaultLeaveTemplates } = require('../../seeders/leaveTemplates.seeder');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} = require('../../utils/token');

// ─── Signup ────────────────────────────────────────────────────────────────────
const signup = async ({ companyName, email, password, firstName, lastName, phone }) => {
  const existingCompany = await Company.findOne({ email: email.toLowerCase() });
  if (existingCompany) throw new AppError('A company with this email is already registered.', 409);

  let slug = slugify(companyName);
  const slugExists = await Company.findOne({ slug });
  if (slugExists) slug = `${slug}-${Date.now()}`;

  const company = await Company.create({
    name:  companyName,
    slug,
    email: email.toLowerCase(),
  });

  const user = await User.create({
    company_id: company._id,
    firstName,
    lastName,
    email:      email.toLowerCase(),
    password,
    phone:      phone || null,
  });

  // Seed the 5 default roles for this company + get back all role docs
  const roles = await seedDefaultRoles(company._id);

  // Seed default salary components (Basic, HRA, PF, etc.)
  await seedDefaultSalaryComponents(company._id);

  // Seed default leave types + templates
  await seedDefaultLeaveTypes(company._id);
  await seedDefaultLeaveTemplates(company._id);

  // Auto-assign Super Admin role to the first user of this company
  await UserRole.create({
    user_id:    user._id,
    role_id:    roles['super-admin']._id,
    company_id: company._id,
    assignedBy: null, // null = system assigned on signup
  });

  return { company, user };
};

// ─── Login ─────────────────────────────────────────────────────────────────────
const login = async ({ email, password }) => {
  const user = await User.findOne({ email: email.toLowerCase() })
    .select('+password +refreshTokens');

  if (!user) throw new AppError('Invalid email or password.', 401);
  if (user.status !== 'active')
    throw new AppError('Account suspended. Contact your administrator.', 403);

  const isMatch = await user.comparePassword(password);
  if (!isMatch) throw new AppError('Invalid email or password.', 401);

  const payload      = { userId: user._id, companyId: user.company_id, email: user.email };
  const accessToken  = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  user.refreshTokens.push(refreshToken);
  user.lastLogin = new Date();
  await user.save();

  return { user, accessToken, refreshToken };
};

// ─── Logout ────────────────────────────────────────────────────────────────────
const logout = async (userId, refreshToken) => {
  if (!userId) return;
  const user = await User.findById(userId).select('+refreshTokens');
  if (!user) return;
  user.refreshTokens = user.refreshTokens.filter((t) => t !== refreshToken);
  await user.save();
};

// ─── Refresh Token ─────────────────────────────────────────────────────────────
const refreshAccessToken = async (refreshToken) => {
  if (!refreshToken) throw new AppError('Refresh token not found.', 401);

  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError('Invalid or expired refresh token.', 401);
  }

  const user = await User.findById(decoded.userId).select('+refreshTokens');
  if (!user || !user.refreshTokens.includes(refreshToken)) {
    // Possible reuse attack — revoke all sessions
    if (user) { user.refreshTokens = []; await user.save(); }
    throw new AppError('Refresh token revoked. Please log in again.', 401);
  }

  const payload         = { userId: user._id, companyId: user.company_id, email: user.email };
  const newAccessToken  = generateAccessToken(payload);
  const newRefreshToken = generateRefreshToken(payload);

  user.refreshTokens = user.refreshTokens.filter((t) => t !== refreshToken);
  user.refreshTokens.push(newRefreshToken);
  await user.save();

  return { newAccessToken, newRefreshToken };
};

// ─── Get Me ────────────────────────────────────────────────────────────────────
const getMe = async (userId) => {
  const user = await User.findById(userId)
    .populate('company_id', 'name slug email plan settings');
  if (!user) throw new AppError('User not found.', 404);

  // Fetch the user's roles for their company
  const userRoles = await UserRole.find({
    user_id:    userId,
    company_id: user.company_id,
  }).populate('role_id', 'name slug level').lean();

  const roleIds = userRoles.map((ur) => ur.role_id._id);

  // Fetch all permissions granted to those roles
  const rolePermissions = await RolePermission.find({
    role_id: { $in: roleIds },
  }).populate('permission_id', 'module action').lean();

  // Build a deduplicated permission list
  // If the same permission appears in multiple roles keep the broadest scope:
  // global > department > team > self
  const scopeRank = { global: 4, department: 3, team: 2, self: 1 };
  const permMap   = {};
  for (const rp of rolePermissions) {
    const key   = `${rp.permission_id.module}:${rp.permission_id.action}`;
    const rank  = scopeRank[rp.scope] ?? 0;
    if (!permMap[key] || rank > (scopeRank[permMap[key].scope] ?? 0)) {
      permMap[key] = { key, scope: rp.scope };
    }
  }

  const permissions = Object.values(permMap);
  const roles       = userRoles.map((ur) => ({
    _id:   ur.role_id._id,
    name:  ur.role_id.name,
    slug:  ur.role_id.slug,
    level: ur.role_id.level,
  }));

  return { user, roles, permissions };
};

module.exports = { signup, login, logout, refreshAccessToken, getMe };
