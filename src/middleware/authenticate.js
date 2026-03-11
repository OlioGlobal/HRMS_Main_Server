const { verifyAccessToken } = require('../utils/token');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

const authenticate = catchAsync(async (req, res, next) => {
  const token = req.cookies?.access_token;
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
