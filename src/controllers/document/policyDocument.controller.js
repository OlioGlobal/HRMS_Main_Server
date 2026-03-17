const catchAsync      = require('../../utils/catchAsync');
const { sendSuccess } = require('../../utils/response');
const service         = require('../../services/document/policyDocument.service');
const Employee        = require('../../models/Employee');
const AppError        = require('../../utils/AppError');

const _resolveEmployee = async (companyId, userId) => {
  const emp = await Employee.findOne({ company_id: companyId, user_id: userId }).lean();
  if (!emp) throw new AppError('Employee record not found for current user', 404);
  return emp;
};

const list = catchAsync(async (req, res) => {
  const policies = await service.listPolicies(req.user.companyId, req.query);
  sendSuccess(res, { data: { policies } });
});

const get = catchAsync(async (req, res) => {
  const policy = await service.getPolicy(req.user.companyId, req.params.id);
  sendSuccess(res, { data: { policy } });
});

const create = catchAsync(async (req, res) => {
  if (!req.file) throw new AppError('No file uploaded', 400);
  const policy = await service.createPolicy(req.user.companyId, req.user.userId, req.body, req.file);
  sendSuccess(res, { status: 201, message: 'Policy created', data: { policy } });
});

const update = catchAsync(async (req, res) => {
  const policy = await service.updatePolicy(req.user.companyId, req.params.id, req.body);
  sendSuccess(res, { message: 'Policy updated', data: { policy } });
});

const newVersion = catchAsync(async (req, res) => {
  if (!req.file) throw new AppError('No file uploaded', 400);
  const policy = await service.createNewVersion(req.user.companyId, req.params.id, req.user.userId, req.body, req.file);
  sendSuccess(res, { status: 201, message: 'New version uploaded', data: { policy } });
});

const versionHistory = catchAsync(async (req, res) => {
  const versions = await service.getVersionHistory(req.user.companyId, req.params.id);
  sendSuccess(res, { data: { versions } });
});

const download = catchAsync(async (req, res) => {
  const result = await service.getPolicyDownloadUrl(req.user.companyId, req.params.id, req.user.userId);
  sendSuccess(res, { data: { downloadUrl: result.url } });
});

const remove = catchAsync(async (req, res) => {
  await service.deletePolicy(req.user.companyId, req.params.id);
  sendSuccess(res, { message: 'Policy deactivated' });
});

const acknowledge = catchAsync(async (req, res) => {
  const emp = await _resolveEmployee(req.user.companyId, req.user.userId);
  const ip  = req.ip || req.headers['x-forwarded-for'] || null;
  const ack = await service.acknowledgePolicy(req.user.companyId, req.params.id, emp._id, ip);
  sendSuccess(res, { status: 201, message: 'Policy acknowledged', data: { acknowledgement: ack } });
});

const acknowledgements = catchAsync(async (req, res) => {
  const result = await service.getAcknowledgements(req.user.companyId, req.params.id);
  sendSuccess(res, { data: result });
});

const myPending = catchAsync(async (req, res) => {
  const emp = await _resolveEmployee(req.user.companyId, req.user.userId);
  const pending = await service.getMyPendingAcknowledgements(req.user.companyId, emp._id);
  sendSuccess(res, { data: { policies: pending } });
});

module.exports = {
  list,
  get,
  create,
  update,
  newVersion,
  versionHistory,
  download,
  remove,
  acknowledge,
  acknowledgements,
  myPending,
};
