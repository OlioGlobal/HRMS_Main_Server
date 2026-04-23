const catchAsync      = require('../../utils/catchAsync');
const { sendSuccess } = require('../../utils/response');
const svc             = require('../../services/hiring/candidates.service');

const listCandidates = catchAsync(async (req, res) => {
  const query = {};
  if (req.query.status)      query.status      = req.query.status;
  if (req.query.pipeline_id) query.pipeline_id = req.query.pipeline_id;
  if (req.query.search)      query.search      = req.query.search;

  const result = await svc.list(req.user.companyId, query);
  sendSuccess(res, { data: result });
});

const createCandidate = catchAsync(async (req, res) => {
  const result = await svc.create(req.user.companyId, req.user.userId, req.body);
  sendSuccess(res, {
    status:  201,
    message: 'Candidate created.',
    data:    result,
  });
});

const updateCandidate = catchAsync(async (req, res) => {
  const result = await svc.update(req.user.companyId, req.params.id, req.body);
  sendSuccess(res, { message: 'Candidate updated.', data: result });
});

const advanceCandidate = catchAsync(async (req, res) => {
  const result = await svc.advance(req.user.companyId, req.params.id, req.body);
  sendSuccess(res, { message: 'Candidate advanced to next stage.', data: result });
});

const activateCandidate = catchAsync(async (req, res) => {
  const result = await svc.activate(req.user.companyId, req.params.id, {
    joiningDate:     req.body.joiningDate,
    probationMonths: req.body.probationMonths,
    email:           req.body.email,
    portalAccess:    req.body.portalAccess,
    roleIds:         req.body.roleIds,
  });
  sendSuccess(res, {
    message: `Employee ${result.candidate.employeeId} activated successfully.`,
    data:    result,
  });
});

const overridePreboarding = catchAsync(async (req, res) => {
  const result = await svc.overridePreboarding(req.user.companyId, req.params.id, req.user.userId);
  sendSuccess(res, { message: 'Pre-boarding marked as complete.', data: result });
});

const removeCandidate = catchAsync(async (req, res) => {
  await svc.remove(req.user.companyId, req.params.id);
  sendSuccess(res, { message: 'Candidate removed.' });
});

const getHrUsers = catchAsync(async (req, res) => {
  const users = await svc.getHrUsers(req.user.companyId);
  sendSuccess(res, { data: { users } });
});

module.exports = {
  listCandidates,
  createCandidate,
  updateCandidate,
  advanceCandidate,
  activateCandidate,
  overridePreboarding,
  removeCandidate,
  getHrUsers,
};
