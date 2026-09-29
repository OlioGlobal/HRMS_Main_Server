const catchAsync      = require('../../utils/catchAsync');
const { sendSuccess } = require('../../utils/response');
const service         = require('../../services/salarySlip/salarySlip.service');

// ─── Grades as breakdown source (structure only — no amounts) ─────────────────
const listGrades = catchAsync(async (req, res) => {
  const grades = await service.listGradeOptions(req.user.companyId);
  sendSuccess(res, { data: { grades } });
});

const getGradeBreakdown = catchAsync(async (req, res) => {
  const breakdown = await service.getGradeBreakdown(req.user.companyId, req.params.id);
  sendSuccess(res, { data: { breakdown } });
});

// ─── Send (stores nothing, logs no amounts) ───────────────────────────────────
const send = catchAsync(async (req, res) => {
  const result = await service.sendManualSlip(req.user.companyId, req.body);
  sendSuccess(res, { message: 'Salary slip sent.', data: result });
});

module.exports = { listGrades, getGradeBreakdown, send };
