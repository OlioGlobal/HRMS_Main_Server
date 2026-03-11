const catchAsync     = require('../../utils/catchAsync');
const { sendSuccess } = require('../../utils/response');
const service        = require('../../services/designation/designation.service');

const list = catchAsync(async (req, res) => {
  const designations = await service.listDesignations(req.user.companyId, {
    department: req.query.department || undefined,
    level:      req.query.level      || undefined,
  });
  sendSuccess(res, { data: { designations } });
});

const get = catchAsync(async (req, res) => {
  const designation = await service.getDesignation(req.user.companyId, req.params.id);
  sendSuccess(res, { data: { designation } });
});

const create = catchAsync(async (req, res) => {
  const designation = await service.createDesignation(req.user.companyId, req.body);
  sendSuccess(res, { status: 201, message: 'Designation created.', data: { designation } });
});

const update = catchAsync(async (req, res) => {
  const designation = await service.updateDesignation(req.user.companyId, req.params.id, req.body);
  sendSuccess(res, { message: 'Designation updated.', data: { designation } });
});

const remove = catchAsync(async (req, res) => {
  await service.deleteDesignation(req.user.companyId, req.params.id);
  sendSuccess(res, { message: 'Designation deleted.' });
});

module.exports = { list, get, create, update, remove };
