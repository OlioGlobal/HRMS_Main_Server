const { verifyAccessToken } = require('../utils/token');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

const authenticate = catchAsync(async (req, res, next) => {
  // Check cookie first (web), then Authorization header (mobile)
  let token = req.cookies?.access_token;
  if (!token && req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (!token) throw new AppError('Not authenticated. Please log in.', 401);

  const decoded = verifyAccessToken(token);

  req.user = {
    userId:    decoded.userId,
    companyId: decoded.companyId,
    email:     decoded.email,
  };

  next();
});

module.exports = authenticate;
