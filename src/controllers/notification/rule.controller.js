const catchAsync      = require('../../utils/catchAsync');
const { sendSuccess } = require('../../utils/response');
const svc             = require('../../services/notification/rule.service');

const listRules = catchAsync(async (req, res) => {
  const result = await svc.listRules(req.user.companyId);
  sendSuccess(res, { data: result });
});

const getRuleById = catchAsync(async (req, res) => {
  const result = await svc.getRuleById(req.params.id, req.user.companyId);
  sendSuccess(res, { data: result });
});

const updateRule = catchAsync(async (req, res) => {
  const result = await svc.updateRule(req.params.id, req.user.companyId, req.body);
  sendSuccess(res, { message: 'Rule updated.', data: result });
});

const getRuleExecutions = catchAsync(async (req, res) => {
  const result = await svc.getRuleExecutions(
    req.params.id,
    req.user.companyId,
    req.query,
  );
  sendSuccess(res, { data: result });
});

module.exports = {
  listRules,
  getRuleById,
  updateRule,
  getRuleExecutions,
};
