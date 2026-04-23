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
const { seedDefaultDocumentTypes }  = require('../../seeders/documentTypes.seeder');
const { seedDefaultNotificationRules } = require('../../seeders/notificationRules.seeder');
const { seedDefaultExpenseCategories }   = require('../../seeders/expenseCategories.seeder');
const { seedDefaultLetterTemplates }     = require('../../seeders/letterTemplates.seeder');
const { seedDefaultHiringPipeline }      = require('../../seeders/hiringPipeline.seeder');
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

  // Seed default document types
  await seedDefaultDocumentTypes(company._id);

  // Seed default notification rules
  await seedDefaultNotificationRules(company._id);

  // Seed default expense categories
  await seedDefaultExpenseCategories(company._id);

  // Seed default letter templates (offer, appointment, experience, increment, relieving)
  await seedDefaultLetterTemplates(company._id);

  // Seed default hiring pipeline (Standard Hiring: Applied → Offered → Accepted)
  await seedDefaultHiringPipeline(company._id);

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
    // Token not found — could be stale cookie after rotation (multi-tab, background tab).
    // Don't wipe all sessions — just reject this request.
    throw new AppError('Refresh token expired. Please log in again.', 401);
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

// ─── Forgot Password ──────────────────────────────────────────────────────────
const crypto = require('crypto');
const { sendEmail, compileTemplate } = require('../../utils/email');

const forgotPassword = async (email) => {
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    // Don't reveal if email exists — always return success
    return;
  }

  // Generate reset token
  const resetToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

  user.passwordResetToken = hashedToken;
  user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  await user.save({ validateBeforeSave: false });

  // Build reset URL
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
  const resetUrl = `${clientUrl}/reset-password?token=${resetToken}&email=${encodeURIComponent(user.email)}`;

  // Send email
  const company = await Company.findById(user.company_id).select('name').lean();
  const html = `<!DOCTYPE html>
<html><head><style>
  body{margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
  .c{max-width:600px;margin:24px auto;background:#fff;border-radius:8px;overflow:hidden}
  .h{background:#18181b;padding:24px;text-align:center;color:#fff;font-size:20px;font-weight:600}
  .b{padding:32px 24px;color:#27272a;line-height:1.6}
  .b h2{margin:0 0 16px;font-size:18px;color:#18181b}
  .b p{margin:0 0 12px;font-size:14px}
  .btn{display:inline-block;padding:14px 36px;background:#ea580c;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;margin:16px 0}
  .expire{font-size:12px;color:#a1a1aa;margin-top:8px}
  .f{padding:16px 24px;text-align:center;font-size:12px;color:#a1a1aa;border-top:1px solid #e4e4e7}
</style></head><body>
<div class="c">
  <div class="h">${company?.name || 'HRMS'}</div>
  <div class="b">
    <h2>Reset Your Password</h2>
    <p>Hi ${user.firstName},</p>
    <p>We received a request to reset your password. Click the button below to set a new password:</p>
    <div style="text-align:center">
      <a href="${resetUrl}" class="btn">Reset Password</a>
    </div>
    <p class="expire">This link expires in 1 hour. If you didn't request this, please ignore this email.</p>
    <p style="font-size:12px;color:#71717a;word-break:break-all">Or copy this link: ${resetUrl}</p>
  </div>
  <div class="f">This is an automated email from ${company?.name || 'HRMS'}. Please do not reply.</div>
</div>
</body></html>`;

  await sendEmail({
    to: user.email,
    subject: `Reset Your Password - ${company?.name || 'HRMS'}`,
    html,
  });
};

// ─── Reset Password ───────────────────────────────────────────────────────────
const resetPassword = async (token, email, newPassword) => {
  if (!token || !email || !newPassword) {
    throw new AppError('Token, email, and new password are required.', 400);
  }

  if (newPassword.length < 8) {
    throw new AppError('Password must be at least 8 characters.', 400);
  }

  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  const user = await User.findOne({
    email: email.toLowerCase(),
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: new Date() },
  }).select('+passwordResetToken +passwordResetExpires +refreshTokens');

  if (!user) {
    throw new AppError('Invalid or expired reset link. Please request a new one.', 400);
  }

  user.password = newPassword;
  user.passwordResetToken = null;
  user.passwordResetExpires = null;
  user.refreshTokens = []; // Invalidate all sessions
  await user.save();

  return { message: 'Password reset successfully. Please log in with your new password.' };
};

module.exports = { signup, login, logout, refreshAccessToken, getMe, forgotPassword, resetPassword };
