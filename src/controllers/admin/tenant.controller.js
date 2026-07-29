const tenantService   = require('../../services/admin/tenant.service');
const catchAsync      = require('../../utils/catchAsync');
const { sendSuccess } = require('../../utils/response');

// GET /api/admin/tenants
const list = catchAsync(async (req, res) => {
  const tenants = await tenantService.listTenants({
    status: req.query.status,
    search: req.query.search,
  });
  sendSuccess(res, { status: 200, message: 'Tenants fetched.', data: { tenants } });
});

// GET /api/admin/tenants/:id
const getOne = catchAsync(async (req, res) => {
  const { tenant, analytics, history } = await tenantService.getTenant(req.params.id);
  sendSuccess(res, { status: 200, message: 'Tenant fetched.', data: { tenant, analytics, history } });
});

// PATCH /api/admin/tenants/:id/assign-plan
const assignPlan = catchAsync(async (req, res) => {
  const data = await tenantService.assignPlan(req.params.id, req.body, req.admin.id);
  sendSuccess(res, { status: 200, message: 'Plan assigned.', data });
});

// PATCH /api/admin/tenants/:id/deactivate
const deactivate = catchAsync(async (req, res) => {
  await tenantService.deactivateTenant(req.params.id, req.admin.id);
  sendSuccess(res, { status: 200, message: 'Tenant deactivated.' });
});

// PATCH /api/admin/tenants/:id/activate
const activate = catchAsync(async (req, res) => {
  await tenantService.activateTenant(req.params.id, req.admin.id);
  sendSuccess(res, { status: 200, message: 'Tenant activated.' });
});

// GET /api/admin/tenants/:id/history
const history = catchAsync(async (req, res) => {
  const history = await tenantService.getHistory(req.params.id);
  sendSuccess(res, { status: 200, message: 'History fetched.', data: { history } });
});

module.exports = { list, getOne, assignPlan, deactivate, activate, history };
