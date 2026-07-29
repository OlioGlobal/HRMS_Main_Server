const analyticsService = require('../../services/admin/analytics.service');
const catchAsync       = require('../../utils/catchAsync');
const { sendSuccess }  = require('../../utils/response');

// GET /api/admin/analytics
const getStats = catchAsync(async (req, res) => {
  const stats = await analyticsService.getPlatformStats();
  sendSuccess(res, { status: 200, message: 'Analytics fetched.', data: { ...stats } });
});

module.exports = { getStats };
