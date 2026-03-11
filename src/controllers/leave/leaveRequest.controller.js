const catchAsync     = require('../../utils/catchAsync');
const { sendSuccess } = require('../../utils/response');
const Employee       = require('../../models/Employee');
const AppError       = require('../../utils/AppError');
const service        = require('../../services/leave/leaveRequest.service');

// Resolve the employee record for the logged-in user
const resolveEmployee = async (userId, companyId) => {
  const emp = await Employee.findOne({ user_id: userId, company_id: companyId }).lean();
  if (!emp) throw new AppError('No employee profile linked to your account.', 400);
  return emp;
};

const apply = catchAsync(async (req, res) => {
  const emp = await resolveEmployee(req.user.userId, req.user.companyId);
  const request = await service.applyLeave(req.user.companyId, emp._id, req.body);
  sendSuccess(res, { status: 201, message: 'Leave request submitted.', data: { request } });
});

const myLeaves = catchAsync(async (req, res) => {
  const emp = await resolveEmployee(req.user.userId, req.user.companyId);
  const result = await service.getMyLeaves(req.user.companyId, emp._id, req.query);
  sendSuccess(res, { data: result });
});

const pending = catchAsync(async (req, res) => {
  const requests = await service.listPendingRequests(
    req.user.companyId,
    req.query,
    req.permissionScope,
    req.user.userId,
  );
  sendSuccess(res, { data: { requests } });
});

const listAll = catchAsync(async (req, res) => {
  const requests = await service.listAllRequests(
    req.user.companyId,
    req.query,
    req.permissionScope,
    req.user.userId,
  );
  sendSuccess(res, { data: { requests } });
});

const approve = catchAsync(async (req, res) => {
  const request = await service.approveLeave(
    req.user.companyId,
    req.params.id,
    req.user.userId,
    req.body.reviewNote
  );
  sendSuccess(res, { message: 'Leave approved.', data: { request } });
});

const reject = catchAsync(async (req, res) => {
  const request = await service.rejectLeave(
    req.user.companyId,
    req.params.id,
    req.user.userId,
    req.body.reviewNote
  );
  sendSuccess(res, { message: 'Leave rejected.', data: { request } });
});

const cancel = catchAsync(async (req, res) => {
  const emp = await resolveEmployee(req.user.userId, req.user.companyId);
  const request = await service.cancelLeave(req.user.companyId, emp._id, req.params.id);
  sendSuccess(res, { message: 'Leave cancelled.', data: { request } });
});

module.exports = { apply, myLeaves, pending, listAll, approve, reject, cancel };
