const planService     = require('../../services/admin/plan.service');
const catchAsync      = require('../../utils/catchAsync');
const { sendSuccess } = require('../../utils/response');

// GET /api/admin/plans
const list = catchAsync(async (req, res) => {
  const plans = await planService.listPlans({ active: req.query.active });
  sendSuccess(res, { status: 200, message: 'Plans fetched.', data: { plans } });
});

// GET /api/admin/plans/:id
const getOne = catchAsync(async (req, res) => {
  const plan = await planService.getPlan(req.params.id);
  sendSuccess(res, { status: 200, message: 'Plan fetched.', data: { plan } });
});

// POST /api/admin/plans
const create = catchAsync(async (req, res) => {
  const plan = await planService.createPlan(req.body);
  sendSuccess(res, { status: 201, message: 'Plan created.', data: { plan } });
});

// PATCH /api/admin/plans/:id
const update = catchAsync(async (req, res) => {
  const plan = await planService.updatePlan(req.params.id, req.body);
  sendSuccess(res, { status: 200, message: 'Plan updated.', data: { plan } });
});

// DELETE /api/admin/plans/:id
const remove = catchAsync(async (req, res) => {
  await planService.deletePlan(req.params.id);
  sendSuccess(res, { status: 200, message: 'Plan deleted.' });
});

module.exports = { list, getOne, create, update, remove };
