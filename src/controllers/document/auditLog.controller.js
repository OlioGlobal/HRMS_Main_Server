const catchAsync      = require('../../utils/catchAsync');
const { sendSuccess } = require('../../utils/response');
const service         = require('../../services/document/auditLog.service');

const list = catchAsync(async (req, res) => {
  const result = await service.listAuditLogs(req.user.companyId, req.query);
  sendSuccess(res, { data: result });
});

module.exports = { list };
