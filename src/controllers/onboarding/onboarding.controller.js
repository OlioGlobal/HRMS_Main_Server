const catchAsync      = require('../../utils/catchAsync');
const { sendSuccess } = require('../../utils/response');
const svc             = require('../../services/onboarding/onboarding.service');

const getOnboardingList = catchAsync(async (req, res) => {
  const data = await svc.getOnboardingList(req.user.companyId, req.query);
  sendSuccess(res, { data });
});

const completeOnboarding = catchAsync(async (req, res) => {
  const employee = await svc.completeOnboarding(req.user.companyId, req.params.id);
  sendSuccess(res, { message: 'Onboarding marked complete.', data: { employee } });
});

const getOffboardingList = catchAsync(async (req, res) => {
  const data = await svc.getOffboardingList(req.user.companyId);
  sendSuccess(res, { data });
});

const updateOffboardingChecklist = catchAsync(async (req, res) => {
  const employee = await svc.updateOffboardingChecklist(req.user.companyId, req.params.id, req.body);
  sendSuccess(res, { message: 'Checklist updated.', data: { employee } });
});

const completeOffboarding = catchAsync(async (req, res) => {
  const employee = await svc.completeOffboarding(req.user.companyId, req.params.id);
  sendSuccess(res, { message: 'Offboarding complete. Employee terminated.', data: { employee } });
});

module.exports = {
  getOnboardingList,
  completeOnboarding,
  getOffboardingList,
  updateOffboardingChecklist,
  completeOffboarding,
};
