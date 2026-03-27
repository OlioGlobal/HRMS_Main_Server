const authService = require('../../services/auth/auth.service');
const catchAsync  = require('../../utils/catchAsync');
const { sendSuccess } = require('../../utils/response');
const { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } = require('../../config/cookie');

// POST /api/auth/signup
const signup = catchAsync(async (req, res) => {
  const { companyName, email, password, firstName, lastName, phone } = req.body;

  const { company, user } = await authService.signup({
    companyName, email, password, firstName, lastName, phone,
  });

  sendSuccess(res, {
    status: 201,
    message: 'Company registered successfully. Please log in.',
    data: {
      company: { id: company._id, name: company.name, slug: company.slug, plan: company.plan },
      user:    { id: user._id, firstName: user.firstName, lastName: user.lastName, email: user.email },
    },
  });
});

// POST /api/auth/login
const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;

  const { user, accessToken, refreshToken } = await authService.login({ email, password });

  res.cookie('access_token',  accessToken,  ACCESS_TOKEN_COOKIE);
  res.cookie('refresh_token', refreshToken, REFRESH_TOKEN_COOKIE);

  sendSuccess(res, {
    status: 200,
    message: 'Login successful.',
    data: {
      user: {
        id:        user._id,
        firstName: user.firstName,
        lastName:  user.lastName,
        email:     user.email,
        companyId: user.company_id,
        lastLogin: user.lastLogin,
      },
    },
  });
});

// POST /api/auth/logout
const logout = catchAsync(async (req, res) => {
  const refreshToken = req.cookies?.refresh_token;
  await authService.logout(req.user?.userId, refreshToken);

  const cookieDomain = process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {};
  const isProd = process.env.NODE_ENV === 'production';
  const clearOpts = { path: '/', httpOnly: true, secure: isProd, sameSite: isProd ? 'none' : 'lax', ...cookieDomain };
  res.clearCookie('access_token',  clearOpts);
  res.clearCookie('refresh_token', clearOpts);

  sendSuccess(res, { status: 200, message: 'Logged out successfully.' });
});

// POST /api/auth/refresh
const refresh = catchAsync(async (req, res) => {
  const { newAccessToken, newRefreshToken } = await authService.refreshAccessToken(
    req.cookies?.refresh_token
  );

  res.cookie('access_token',  newAccessToken,  ACCESS_TOKEN_COOKIE);
  res.cookie('refresh_token', newRefreshToken, REFRESH_TOKEN_COOKIE);

  sendSuccess(res, { status: 200, message: 'Token refreshed.' });
});

// GET /api/auth/me
const getMe = catchAsync(async (req, res) => {
  const { user, roles, permissions } = await authService.getMe(req.user.userId);
  sendSuccess(res, { status: 200, message: 'User fetched.', data: { user, roles, permissions } });
});

// POST /api/auth/forgot-password
const forgotPassword = catchAsync(async (req, res) => {
  await authService.forgotPassword(req.body.email);
  sendSuccess(res, { status: 200, message: 'If this email exists, a reset link has been sent.' });
});

// POST /api/auth/reset-password
const resetPassword = catchAsync(async (req, res) => {
  const { token, email, password } = req.body;
  const result = await authService.resetPassword(token, email, password);
  sendSuccess(res, { status: 200, message: result.message });
});

module.exports = { signup, login, logout, refresh, getMe, forgotPassword, resetPassword };
