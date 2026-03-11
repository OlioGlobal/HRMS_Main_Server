const catchAsync     = require('../../utils/catchAsync');
const { sendSuccess } = require('../../utils/response');
const service        = require('../../services/attendance/regularization.service');

const submit = catchAsync(async (req, res) => {
  const request = await service.submit(req.user.companyId, req.user.userId, req.body);
  sendSuccess(res, { status: 201, message: 'Regularization request submitted.', data: { request } });
});

const myRequests = catchAsync(async (req, res) => {
  const result = await service.getMyRequests(req.user.companyId, req.user.userId, req.query);
  sendSuccess(res, { data: result });
});

const listAll = catchAsync(async (req, res) => {
  const result = await service.listRequests(
    req.user.companyId,
    req.query,
    req.permissionScope,
    req.user.userId,
  );
  sendSuccess(res, { data: result });
});

const approve = catchAsync(async (req, res) => {
  const request = await service.approve(
    req.user.companyId,
    req.params.id,
    req.user.userId,
    req.body.reviewNote,
  );
  sendSuccess(res, { message: 'Regularization approved.', data: { request } });
});

const reject = catchAsync(async (req, res) => {
  const request = await service.reject(
    req.user.companyId,
    req.params.id,
    req.user.userId,
    req.body.reviewNote,
  );
  sendSuccess(res, { message: 'Regularization rejected.', data: { request } });
});

const cancel = catchAsync(async (req, res) => {
  const request = await service.cancel(req.user.companyId, req.user.userId, req.params.id);
  sendSuccess(res, { message: 'Regularization cancelled.', data: { request } });
});

module.exports = { submit, myRequests, listAll, approve, reject, cancel };
