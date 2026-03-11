const catchAsync      = require('../../utils/catchAsync');
const { sendSuccess } = require('../../utils/response');
const svc             = require('../../services/department/department.service');

const listDepartments = catchAsync(async (req, res) => {
  const departments = await svc.listDepartments(req.user.companyId);
  sendSuccess(res, { data: { departments } });
});

const getDepartment = catchAsync(async (req, res) => {
  const department = await svc.getDepartment(req.user.companyId, req.params.id);
  sendSuccess(res, { data: { department } });
});

const createDepartment = catchAsync(async (req, res) => {
  const department = await svc.createDepartment(req.user.companyId, req.body);
  sendSuccess(res, { status: 201, message: 'Department created.', data: { department } });
});

const updateDepartment = catchAsync(async (req, res) => {
  const department = await svc.updateDepartment(req.user.companyId, req.params.id, req.body);
  sendSuccess(res, { message: 'Department updated.', data: { department } });
});

const deleteDepartment = catchAsync(async (req, res) => {
  await svc.deleteDepartment(req.user.companyId, req.params.id);
  sendSuccess(res, { message: 'Department deleted.' });
});

module.exports = { listDepartments, getDepartment, createDepartment, updateDepartment, deleteDepartment };
