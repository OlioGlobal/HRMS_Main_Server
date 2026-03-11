const Permission     = require('../../models/Permission');
const catchAsync     = require('../../utils/catchAsync');
const { sendSuccess } = require('../../utils/response');

// GET /api/permissions
// Returns all system permissions grouped by module
const listPermissions = catchAsync(async (req, res) => {
  const permissions = await Permission.find({}).sort({ module: 1, action: 1 }).lean();

  // Group by module
  const grouped = permissions.reduce((acc, p) => {
    if (!acc[p.module]) acc[p.module] = [];
    acc[p.module].push({ id: p._id, action: p.action, description: p.description });
    return acc;
  }, {});

  // Convert to array for consistent frontend consumption
  const modules = Object.entries(grouped).map(([module, actions]) => ({ module, actions }));

  sendSuccess(res, { status: 200, message: 'Permissions fetched.', data: { modules } });
});

module.exports = { listPermissions };
