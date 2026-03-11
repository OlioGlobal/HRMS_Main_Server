const catchAsync   = require('../../utils/catchAsync');
const { sendSuccess } = require('../../utils/response');
const service      = require('../../services/salary/employeeSalary.service');

const listForEmployee = catchAsync(async (req, res) => {
  const salaries = await service.listForEmployee(req.user.companyId, req.params.employeeId);
  sendSuccess(res, { data: { salaries } });
});

const getActive = catchAsync(async (req, res) => {
  const salary = await service.getActiveSalary(req.user.companyId, req.params.employeeId);
  sendSuccess(res, { data: { salary } });
});

const assign = catchAsync(async (req, res) => {
  const salary = await service.assignSalary(
    req.user.companyId,
    req.params.employeeId,
    req.user.userId,
    req.body
  );
  sendSuccess(res, { status: 201, message: 'Salary assigned.', data: { salary } });
});

module.exports = { listForEmployee, getActive, assign };
