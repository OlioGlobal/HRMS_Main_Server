const catchAsync     = require('../../utils/catchAsync');
const { sendSuccess } = require('../../utils/response');
const AppError       = require('../../utils/AppError');
const service        = require('../../services/appraisal/appraisal.service');
const Employee       = require('../../models/Employee');

// Helper: resolve employee from logged-in user
const resolveEmployee = async (req) => {
  const emp = await Employee.findOne({ user_id: req.user.userId, company_id: req.user.companyId }).lean();
  if (!emp) throw new AppError('Employee record not found for your account', 404);
  return emp;
};

// ═══════════════════════════════════════════════════════════════════════════════
//  CYCLES
// ═══════════════════════════════════════════════════════════════════════════════

const listCycles = catchAsync(async (req, res) => {
  const cycles = await service.listCycles(req.user.companyId, req.query);
  sendSuccess(res, { data: { cycles } });
});

const getCycle = catchAsync(async (req, res) => {
  const cycle = await service.getCycle(req.user.companyId, req.params.id);
  sendSuccess(res, { data: { cycle } });
});

const createCycle = catchAsync(async (req, res) => {
  const cycle = await service.createCycle(req.user.companyId, req.user.userId, req.body);
  sendSuccess(res, { status: 201, message: 'Appraisal cycle created.', data: { cycle } });
});

const updateCycle = catchAsync(async (req, res) => {
  const cycle = await service.updateCycle(req.user.companyId, req.params.id, req.body);
  sendSuccess(res, { message: 'Appraisal cycle updated.', data: { cycle } });
});

const deleteCycle = catchAsync(async (req, res) => {
  await service.deleteCycle(req.user.companyId, req.params.id);
  sendSuccess(res, { message: 'Appraisal cycle deleted.' });
});

const activateCycle = catchAsync(async (req, res) => {
  const result = await service.activateCycle(req.user.companyId, req.params.id);
  sendSuccess(res, {
    message: `Cycle activated. ${result.recordsCreated} records created.`,
    data: { cycle: result.cycle, recordsCreated: result.recordsCreated, goalsCreated: result.goalsCreated },
  });
});

const completeCycle = catchAsync(async (req, res) => {
  const cycle = await service.completeCycle(req.user.companyId, req.params.id);
  sendSuccess(res, { message: 'Appraisal cycle completed.', data: { cycle } });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  RECORDS (HR)
// ═══════════════════════════════════════════════════════════════════════════════

const listRecords = catchAsync(async (req, res) => {
  const records = await service.listRecords(req.user.companyId, req.params.id, req.query);
  sendSuccess(res, { data: { records } });
});

const getRecord = catchAsync(async (req, res) => {
  const record = await service.getRecord(req.user.companyId, req.params.id, req.params.empId);
  sendSuccess(res, { data: { record } });
});

const finalizeRecord = catchAsync(async (req, res) => {
  const record = await service.finalizeRecord(
    req.user.companyId, req.params.id, req.params.empId, req.user.userId, req.body
  );
  sendSuccess(res, { message: 'Appraisal finalized.', data: { record } });
});

const shareRecord = catchAsync(async (req, res) => {
  const record = await service.shareRecord(req.user.companyId, req.params.id, req.params.empId);
  sendSuccess(res, { message: 'Appraisal shared with employee.', data: { record } });
});

const assignReviewer = catchAsync(async (req, res) => {
  const record = await service.assignReviewer(
    req.user.companyId, req.params.id, req.params.empId, req.body.reviewer_id
  );
  sendSuccess(res, { message: 'Reviewer assigned.', data: { record } });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  MY APPRAISAL (Employee)
// ═══════════════════════════════════════════════════════════════════════════════

const getMyAppraisal = catchAsync(async (req, res) => {
  const emp = await resolveEmployee(req);
  const appraisals = await service.getMyAppraisal(req.user.companyId, emp._id);
  sendSuccess(res, { data: { appraisals } });
});

const getMyHistory = catchAsync(async (req, res) => {
  const emp = await resolveEmployee(req);
  const history = await service.getMyHistory(req.user.companyId, emp._id);
  sendSuccess(res, { data: { history } });
});

const submitSelfRating = catchAsync(async (req, res) => {
  const emp = await resolveEmployee(req);
  const record = await service.submitSelfRating(req.user.companyId, emp._id, req.params.cycleId, req.body);
  sendSuccess(res, { message: 'Self rating submitted.', data: { record } });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  TEAM (Manager)
// ═══════════════════════════════════════════════════════════════════════════════

const getTeamAppraisals = catchAsync(async (req, res) => {
  const emp = await resolveEmployee(req);
  const records = await service.getTeamAppraisals(req.user.companyId, emp._id);
  sendSuccess(res, { data: { records } });
});

const submitManagerRating = catchAsync(async (req, res) => {
  const emp = await resolveEmployee(req);
  const record = await service.submitManagerRating(
    req.user.companyId, emp._id, req.params.cycleId, req.params.empId, req.body
  );
  sendSuccess(res, { message: 'Manager rating submitted.', data: { record } });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  GOALS
// ═══════════════════════════════════════════════════════════════════════════════

const listGoals = catchAsync(async (req, res) => {
  const goals = await service.listGoals(req.params.recordId);
  sendSuccess(res, { data: { goals } });
});

const createGoal = catchAsync(async (req, res) => {
  const emp = await resolveEmployee(req);
  const goal = await service.createGoal(req.user.companyId, req.params.recordId, emp._id, req.body, req.user.userId);
  sendSuccess(res, { status: 201, message: 'Goal created.', data: { goal } });
});

const createGoalForTeam = catchAsync(async (req, res) => {
  const goals = await service.createGoalForTeam(req.user.companyId, req.params.cycleId, req.user.userId, req.body);
  sendSuccess(res, { status: 201, message: `Goal created for ${goals.length} team member(s).`, data: { goals } });
});

const updateGoal = catchAsync(async (req, res) => {
  const goal = await service.updateGoal(req.user.companyId, req.params.recordId, req.params.goalId, req.body, req.user.userId);
  sendSuccess(res, { message: 'Goal updated.', data: { goal } });
});

const deleteGoal = catchAsync(async (req, res) => {
  await service.deleteGoal(req.user.companyId, req.params.recordId, req.params.goalId, req.user.userId);
  sendSuccess(res, { message: 'Goal deleted.' });
});

const submitGoals = catchAsync(async (req, res) => {
  const record = await service.submitGoals(req.user.companyId, req.params.recordId);
  sendSuccess(res, { message: 'Goals submitted for approval.', data: { record } });
});

const approveGoals = catchAsync(async (req, res) => {
  const record = await service.approveGoals(req.user.companyId, req.params.recordId, req.user.userId);
  sendSuccess(res, { message: 'Goals approved.', data: { record } });
});

const rejectGoals = catchAsync(async (req, res) => {
  const record = await service.rejectGoals(req.user.companyId, req.params.recordId, req.body);
  sendSuccess(res, { message: 'Goals rejected.', data: { record } });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════════

const listTemplates = catchAsync(async (req, res) => {
  const templates = await service.listTemplates(req.user.companyId);
  sendSuccess(res, { data: { templates } });
});

const createTemplate = catchAsync(async (req, res) => {
  const template = await service.createTemplate(req.user.companyId, req.body);
  sendSuccess(res, { status: 201, message: 'Template created.', data: { template } });
});

const updateTemplate = catchAsync(async (req, res) => {
  const template = await service.updateTemplate(req.user.companyId, req.params.id, req.body);
  sendSuccess(res, { message: 'Template updated.', data: { template } });
});

const deleteTemplate = catchAsync(async (req, res) => {
  await service.deleteTemplate(req.user.companyId, req.params.id);
  sendSuccess(res, { message: 'Template deleted.' });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════

const getDashboardAppraisal = catchAsync(async (req, res) => {
  const emp = await resolveEmployee(req);
  const appraisal = await service.getDashboardAppraisal(req.user.companyId, emp._id);
  sendSuccess(res, { data: { appraisal } });
});

const listReviewers = catchAsync(async (req, res) => {
  const reviewers = await service.listReviewers(req.user.companyId);
  sendSuccess(res, { data: { reviewers } });
});

module.exports = {
  listCycles, getCycle, createCycle, updateCycle, deleteCycle, activateCycle, completeCycle,
  listRecords, getRecord, finalizeRecord, shareRecord, assignReviewer,
  getMyAppraisal, getMyHistory, submitSelfRating,
  getTeamAppraisals, submitManagerRating,
  listGoals, createGoal, createGoalForTeam, updateGoal, deleteGoal, submitGoals, approveGoals, rejectGoals,
  listTemplates, createTemplate, updateTemplate, deleteTemplate,
  getDashboardAppraisal, listReviewers,
};
