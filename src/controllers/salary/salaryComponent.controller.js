const catchAsync   = require('../../utils/catchAsync');
const { sendSuccess } = require('../../utils/response');
const service      = require('../../services/salary/salaryComponent.service');

const list = catchAsync(async (req, res) => {
  const components = await service.listComponents(req.user.companyId, {
    includeInactive: req.query.includeInactive === 'true',
  });
  sendSuccess(res, { data: { components } });
});

const get = catchAsync(async (req, res) => {
  const component = await service.getComponent(req.user.companyId, req.params.id);
  sendSuccess(res, { data: { component } });
});

const create = catchAsync(async (req, res) => {
  const component = await service.createComponent(req.user.companyId, req.body);
  sendSuccess(res, { status: 201, message: 'Salary component created.', data: { component } });
});

const update = catchAsync(async (req, res) => {
  const component = await service.updateComponent(req.user.companyId, req.params.id, req.body);
  sendSuccess(res, { message: 'Salary component updated.', data: { component } });
});

const remove = catchAsync(async (req, res) => {
  await service.deleteComponent(req.user.companyId, req.params.id);
  sendSuccess(res, { message: 'Salary component deleted.' });
});

module.exports = { list, get, create, update, remove };
