const PlatformUser = require('../../models/PlatformUser');
const AppError     = require('../../utils/AppError');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} = require('../../utils/token');

const buildPayload = (admin) => ({
  platformUserId: admin._id,
  isPlatform:     true,
  email:          admin.email,
});

// ─── Login ──────────────────────────────────────────────────────────────────
const login = async ({ email, password }) => {
  const admin = await PlatformUser.findOne({ email: email.toLowerCase() })
    .select('+password +refreshTokens');

  if (!admin) throw new AppError('Invalid email or password.', 401);
  if (!admin.isActive) throw new AppError('This administrator account is disabled.', 403);

  const isMatch = await admin.comparePassword(password);
  if (!isMatch) throw new AppError('Invalid email or password.', 401);

  const payload      = buildPayload(admin);
  const accessToken  = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  admin.refreshTokens.push(refreshToken);
  admin.lastLogin = new Date();
  await admin.save();

  return { admin, accessToken, refreshToken };
};

// ─── Logout ─────────────────────────────────────────────────────────────────
const logout = async (adminId, refreshToken) => {
  if (!adminId) return;
  const admin = await PlatformUser.findById(adminId).select('+refreshTokens');
  if (!admin) return;
  admin.refreshTokens = admin.refreshTokens.filter((t) => t !== refreshToken);
  await admin.save();
};

// ─── Refresh ────────────────────────────────────────────────────────────────
const refreshAccessToken = async (refreshToken) => {
  if (!refreshToken) throw new AppError('Refresh token not found.', 401);

  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError('Invalid or expired refresh token.', 401);
  }

  if (!decoded.isPlatform || !decoded.platformUserId) {
    throw new AppError('Invalid refresh token.', 401);
  }

  const admin = await PlatformUser.findById(decoded.platformUserId).select('+refreshTokens');
  if (!admin || !admin.refreshTokens.includes(refreshToken)) {
    throw new AppError('Refresh token expired. Please log in again.', 401);
  }

  const payload         = buildPayload(admin);
  const newAccessToken  = generateAccessToken(payload);
  const newRefreshToken = generateRefreshToken(payload);

  admin.refreshTokens = admin.refreshTokens.filter((t) => t !== refreshToken);
  admin.refreshTokens.push(newRefreshToken);
  await admin.save();

  return { newAccessToken, newRefreshToken };
};

// ─── Me ─────────────────────────────────────────────────────────────────────
const getMe = async (adminId) => {
  const admin = await PlatformUser.findById(adminId).select('name email role isActive lastLogin');
  if (!admin) throw new AppError('Administrator not found.', 404);
  return admin;
};

module.exports = { login, logout, refreshAccessToken, getMe };
