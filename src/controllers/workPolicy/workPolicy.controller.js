const catchAsync      = require('../../utils/catchAsync');
const { sendSuccess } = require('../../utils/response');
const svc             = require('../../services/workPolicy/workPolicy.service');

const listWorkPolicies = catchAsync(async (req, res) => {
  const filters = {};
  if (req.query.location_id) filters.location_id = req.query.location_id;
  const policies = await svc.listWorkPolicies(req.user.companyId, filters);
  sendSuccess(res, { data: { policies } });
});

const getWorkPolicy = catchAsync(async (req, res) => {
  const policy = await svc.getWorkPolicy(req.user.companyId, req.params.id);
  sendSuccess(res, { data: { policy } });
});

const createWorkPolicy = catchAsync(async (req, res) => {
  const policy = await svc.createWorkPolicy(req.user.companyId, req.body);
  sendSuccess(res, { status: 201, message: 'Work policy created.', data: { policy } });
});

const updateWorkPolicy = catchAsync(async (req, res) => {
  const policy = await svc.updateWorkPolicy(req.user.companyId, req.params.id, req.body);
  sendSuccess(res, { message: 'Work policy updated.', data: { policy } });
});

const deleteWorkPolicy = catchAsync(async (req, res) => {
  await svc.deleteWorkPolicy(req.user.companyId, req.params.id);
  sendSuccess(res, { message: 'Work policy deleted.' });
});

module.exports = { listWorkPolicies, getWorkPolicy, createWorkPolicy, updateWorkPolicy, deleteWorkPolicy };
