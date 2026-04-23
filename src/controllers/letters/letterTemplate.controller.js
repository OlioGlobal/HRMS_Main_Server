const catchAsync      = require('../../utils/catchAsync');
const { sendSuccess } = require('../../utils/response');
const svc             = require('../../services/letters/letterTemplate.service');

const list = catchAsync(async (req, res) => {
  const templates = await svc.list(req.user.companyId, req.query);
  sendSuccess(res, { data: { templates } });
});

const getOne = catchAsync(async (req, res) => {
  const template = await svc.getOne(req.user.companyId, req.params.id);
  sendSuccess(res, { data: { template } });
});

const create = catchAsync(async (req, res) => {
  const template = await svc.create(req.user.companyId, req.user.id, req.body);
  sendSuccess(res, { status: 201, message: 'Letter template created.', data: { template } });
});

const update = catchAsync(async (req, res) => {
  const template = await svc.update(req.user.companyId, req.user.id, req.params.id, req.body);
  sendSuccess(res, { message: 'Letter template updated.', data: { template } });
});

const remove = catchAsync(async (req, res) => {
  await svc.remove(req.user.companyId, req.params.id);
  sendSuccess(res, { message: 'Letter template deleted.' });
});

const preview = catchAsync(async (req, res) => {
  const { employeeId } = req.query;
  const result = await svc.preview(req.user.companyId, req.params.id, employeeId);
  sendSuccess(res, { data: result });
});

module.exports = { list, getOne, create, update, remove, preview };
