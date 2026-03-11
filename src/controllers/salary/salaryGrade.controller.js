const catchAsync   = require('../../utils/catchAsync');
const { sendSuccess } = require('../../utils/response');
const service      = require('../../services/salary/salaryGrade.service');

const list = catchAsync(async (req, res) => {
  const grades = await service.listGrades(req.user.companyId);
  sendSuccess(res, { data: { grades } });
});

const get = catchAsync(async (req, res) => {
  const grade = await service.getGrade(req.user.companyId, req.params.id);
  sendSuccess(res, { data: { grade } });
});

const create = catchAsync(async (req, res) => {
  const grade = await service.createGrade(req.user.companyId, req.body);
  sendSuccess(res, { status: 201, message: 'Salary grade created.', data: { grade } });
});

const update = catchAsync(async (req, res) => {
  const grade = await service.updateGrade(req.user.companyId, req.params.id, req.body);
  sendSuccess(res, { message: 'Salary grade updated.', data: { grade } });
});

const remove = catchAsync(async (req, res) => {
  await service.deleteGrade(req.user.companyId, req.params.id);
  sendSuccess(res, { message: 'Salary grade deleted.' });
});

module.exports = { list, get, create, update, remove };
