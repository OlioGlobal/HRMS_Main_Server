const catchAsync     = require('../../utils/catchAsync');
const { sendSuccess } = require('../../utils/response');
const Employee       = require('../../models/Employee');
const AppError       = require('../../utils/AppError');
const service        = require('../../services/leave/leaveBalance.service');

const getMyBalances = catchAsync(async (req, res) => {
  const emp = await Employee.findOne({ user_id: req.user.userId, company_id: req.user.companyId }).lean();
  if (!emp) throw new AppError('No employee profile linked to your account.', 400);
  const balances = await service.getEmployeeBalances(req.user.companyId, emp._id, req.query.year);
  sendSuccess(res, { data: { balances } });
});

const getEmployeeBalances = catchAsync(async (req, res) => {
  const balances = await service.getEmployeeBalances(
    req.user.companyId,
    req.params.employeeId,
    req.query.year
  );
  sendSuccess(res, { data: { balances } });
});

const listAll = catchAsync(async (req, res) => {
  const balances = await service.listAllBalances(req.user.companyId, req.query);
  sendSuccess(res, { data: { balances } });
});

const adjust = catchAsync(async (req, res) => {
  const balance = await service.adjustBalance(req.user.companyId, req.params.id, req.body);
  sendSuccess(res, { message: 'Balance adjusted.', data: { balance } });
});

module.exports = { getMyBalances, getEmployeeBalances, listAll, adjust };
