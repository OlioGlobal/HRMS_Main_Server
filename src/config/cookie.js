const isProd = process.env.NODE_ENV === 'production';

const ACCESS_TOKEN_COOKIE = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? 'strict' : 'lax',
  path: '/',
  maxAge: 15 * 60 * 1000,           // 15 minutes
};

const REFRESH_TOKEN_COOKIE = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? 'strict' : 'lax',
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

module.exports = { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE };
