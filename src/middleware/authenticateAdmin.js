const { verifyAccessToken } = require('../utils/token');
const AppError    = require('../utils/AppError');
const catchAsync  = require('../utils/catchAsync');
const PlatformUser = require('../models/PlatformUser');

// Authenticates a platform Super Admin. Reads the SEPARATE admin cookie
// (admin_access_token) so it never collides with tenant sessions. The token
// payload carries { platformUserId, isPlatform: true }.
const authenticateAdmin = catchAsync(async (req, res, next) => {
  let token = req.cookies?.admin_access_token;
  if (!token && req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (!token) throw new AppError('Not authenticated. Please log in as an administrator.', 401);

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch {
    throw new AppError('Invalid or expired session. Please log in again.', 401);
  }

  if (!decoded.isPlatform || !decoded.platformUserId) {
    throw new AppError('Not authorized for the admin area.', 403);
  }

  const admin = await PlatformUser.findById(decoded.platformUserId).select('_id name email role isActive');
  if (!admin || !admin.isActive) {
    throw new AppError('Administrator account not found or disabled.', 401);
  }

  req.admin = { id: admin._id, name: admin.name, email: admin.email, role: admin.role };
  next();
});

module.exports = authenticateAdmin;
