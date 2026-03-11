const catchAsync     = require('../../utils/catchAsync');
const { sendSuccess } = require('../../utils/response');
const service        = require('../../services/leave/leaveType.service');

const list = catchAsync(async (req, res) => {
  const leaveTypes = await service.listLeaveTypes(req.user.companyId);
  sendSuccess(res, { data: { leaveTypes } });
});

const get = catchAsync(async (req, res) => {
  const leaveType = await service.getLeaveType(req.user.companyId, req.params.id);
  sendSuccess(res, { data: { leaveType } });
});

const create = catchAsync(async (req, res) => {
  const leaveType = await service.createLeaveType(req.user.companyId, req.body);
  sendSuccess(res, { status: 201, message: 'Leave type created.', data: { leaveType } });
});

const update = catchAsync(async (req, res) => {
  const leaveType = await service.updateLeaveType(req.user.companyId, req.params.id, req.body);
  sendSuccess(res, { message: 'Leave type updated.', data: { leaveType } });
});

const remove = catchAsync(async (req, res) => {
  await service.deleteLeaveType(req.user.companyId, req.params.id);
  sendSuccess(res, { message: 'Leave type deleted.' });
});

module.exports = { list, get, create, update, remove };
