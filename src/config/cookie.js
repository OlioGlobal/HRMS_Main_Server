const isProd = process.env.NODE_ENV === 'production';

// In production with cross-subdomain setup (e.g., hrmstest.olioglobal.in + hrmsbktest.olioglobal.in),
// cookies need sameSite: 'none' + secure: true, and a shared domain.
const cookieDomain = process.env.COOKIE_DOMAIN || undefined; // e.g., '.olioglobal.in'

const ACCESS_TOKEN_COOKIE = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? 'none' : 'lax',
  path: '/',
  maxAge: 15 * 60 * 1000,           // 15 minutes
  ...(cookieDomain ? { domain: cookieDomain } : {}),
};

const REFRESH_TOKEN_COOKIE = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? 'none' : 'lax',
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  ...(cookieDomain ? { domain: cookieDomain } : {}),
};

module.exports = { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE };
