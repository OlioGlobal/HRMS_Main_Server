const adminAuthService = require('../../services/admin/adminAuth.service');
const catchAsync       = require('../../utils/catchAsync');
const { sendSuccess }  = require('../../utils/response');
const { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } = require('../../config/cookie');

const ADMIN_ACCESS_COOKIE  = 'admin_access_token';
const ADMIN_REFRESH_COOKIE = 'admin_refresh_token';

const adminData = (admin) => ({
  id:        admin._id,
  name:      admin.name,
  email:     admin.email,
  role:      admin.role,
  lastLogin: admin.lastLogin,
});

// POST /api/admin/auth/login
const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  const { admin, accessToken, refreshToken } = await adminAuthService.login({ email, password });

  res.cookie(ADMIN_ACCESS_COOKIE,  accessToken,  ACCESS_TOKEN_COOKIE);
  res.cookie(ADMIN_REFRESH_COOKIE, refreshToken, REFRESH_TOKEN_COOKIE);

  sendSuccess(res, { status: 200, message: 'Login successful.', data: { admin: adminData(admin) } });
});

// POST /api/admin/auth/logout
const logout = catchAsync(async (req, res) => {
  const refreshToken = req.cookies?.[ADMIN_REFRESH_COOKIE];
  await adminAuthService.logout(req.admin?.id, refreshToken);

  const cookieDomain = process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {};
  const isProd = process.env.NODE_ENV === 'production';
  const clearOpts = { path: '/', httpOnly: true, secure: isProd, sameSite: isProd ? 'none' : 'lax', ...cookieDomain };
  res.clearCookie(ADMIN_ACCESS_COOKIE,  clearOpts);
  res.clearCookie(ADMIN_REFRESH_COOKIE, clearOpts);

  sendSuccess(res, { status: 200, message: 'Logged out successfully.' });
});

// POST /api/admin/auth/refresh
const refresh = catchAsync(async (req, res) => {
  const { newAccessToken, newRefreshToken } = await adminAuthService.refreshAccessToken(
    req.cookies?.[ADMIN_REFRESH_COOKIE]
  );

  res.cookie(ADMIN_ACCESS_COOKIE,  newAccessToken,  ACCESS_TOKEN_COOKIE);
  res.cookie(ADMIN_REFRESH_COOKIE, newRefreshToken, REFRESH_TOKEN_COOKIE);

  sendSuccess(res, { status: 200, message: 'Token refreshed.' });
});

// GET /api/admin/auth/me
const getMe = catchAsync(async (req, res) => {
  const admin = await adminAuthService.getMe(req.admin.id);
  sendSuccess(res, { status: 200, message: 'Admin fetched.', data: { admin: adminData(admin) } });
});

module.exports = { login, logout, refresh, getMe };
