const catchAsync      = require('../../utils/catchAsync');
const { sendSuccess } = require('../../utils/response');
const svc             = require('../../services/letters/hiringPipeline.service');

const list = catchAsync(async (req, res) => {
  const pipelines = await svc.list(req.user.companyId);
  sendSuccess(res, { data: { pipelines } });
});

const getOne = catchAsync(async (req, res) => {
  const pipeline = await svc.getOne(req.user.companyId, req.params.id);
  sendSuccess(res, { data: { pipeline } });
});

const getDefault = catchAsync(async (req, res) => {
  const pipeline = await svc.getDefault(req.user.companyId);
  sendSuccess(res, { data: { pipeline } });
});

const create = catchAsync(async (req, res) => {
  const pipeline = await svc.create(req.user.companyId, req.user.id, req.body);
  sendSuccess(res, { status: 201, message: 'Hiring pipeline created.', data: { pipeline } });
});

const update = catchAsync(async (req, res) => {
  const pipeline = await svc.update(req.user.companyId, req.params.id, req.body);
  sendSuccess(res, { message: 'Hiring pipeline updated.', data: { pipeline } });
});

const remove = catchAsync(async (req, res) => {
  await svc.remove(req.user.companyId, req.params.id);
  sendSuccess(res, { message: 'Hiring pipeline deleted.' });
});

const assignToEmployee = catchAsync(async (req, res) => {
  const employee = await svc.assignToEmployee(req.user.companyId, req.params.employeeId, req.body.pipeline_id);
  sendSuccess(res, { message: 'Pipeline assigned to employee.', data: { employee } });
});

module.exports = { list, getOne, getDefault, create, update, remove, assignToEmployee };
