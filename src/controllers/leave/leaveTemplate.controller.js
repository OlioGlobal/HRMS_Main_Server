const catchAsync     = require('../../utils/catchAsync');
const { sendSuccess } = require('../../utils/response');
const service        = require('../../services/leave/leaveTemplate.service');

const list = catchAsync(async (req, res) => {
  const templates = await service.listTemplates(req.user.companyId);
  sendSuccess(res, { data: { templates } });
});

const get = catchAsync(async (req, res) => {
  const template = await service.getTemplate(req.user.companyId, req.params.id);
  sendSuccess(res, { data: { template } });
});

const create = catchAsync(async (req, res) => {
  const template = await service.createTemplate(req.user.companyId, req.body);
  sendSuccess(res, { status: 201, message: 'Leave template created.', data: { template } });
});

const update = catchAsync(async (req, res) => {
  const template = await service.updateTemplate(req.user.companyId, req.params.id, req.body);
  sendSuccess(res, { message: 'Leave template updated.', data: { template } });
});

const remove = catchAsync(async (req, res) => {
  await service.deleteTemplate(req.user.companyId, req.params.id);
  sendSuccess(res, { message: 'Leave template deleted.' });
});

const assign = catchAsync(async (req, res) => {
  const result = await service.assignTemplate(req.user.companyId, req.params.id, req.body.employeeIds);
  sendSuccess(res, { message: `Template assigned to ${result.assigned} employee(s).`, data: result });
});

module.exports = { list, get, create, update, remove, assign };
