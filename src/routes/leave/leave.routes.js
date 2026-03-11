const express = require('express');
const router  = express.Router();

const authenticate = require('../../middleware/authenticate');
const authorize    = require('../../middleware/authorize');

const typeCtrl     = require('../../controllers/leave/leaveType.controller');
const templateCtrl = require('../../controllers/leave/leaveTemplate.controller');
const balanceCtrl  = require('../../controllers/leave/leaveBalance.controller');
const requestCtrl  = require('../../controllers/leave/leaveRequest.controller');

const {
  createLeaveTypeValidator,
  updateLeaveTypeValidator,
  createTemplateValidator,
  updateTemplateValidator,
  assignTemplateValidator,
  applyLeaveValidator,
  reviewValidator,
  adjustBalanceValidator,
} = require('../../validators/leave/leave.validator');

// ─── Leave Types ────────────────────────────────────────────────────────────
router.get(   '/types/available', authenticate, typeCtrl.list); // Any logged-in user (for apply leave dropdown)
router.get(   '/types',     authenticate, authorize('leave_types', 'view'),   typeCtrl.list);
router.post(  '/types',     authenticate, authorize('leave_types', 'create'), createLeaveTypeValidator, typeCtrl.create);
router.get(   '/types/:id', authenticate, authorize('leave_types', 'view'),   typeCtrl.get);
router.patch( '/types/:id', authenticate, authorize('leave_types', 'update'), updateLeaveTypeValidator, typeCtrl.update);
router.delete('/types/:id', authenticate, authorize('leave_types', 'delete'), typeCtrl.remove);

// ─── Leave Templates ───────────────────────────────────────────────────────
router.get(   '/templates',            authenticate, authorize('leave_templates', 'view'),   templateCtrl.list);
router.post(  '/templates',            authenticate, authorize('leave_templates', 'create'), createTemplateValidator, templateCtrl.create);
router.get(   '/templates/:id',        authenticate, authorize('leave_templates', 'view'),   templateCtrl.get);
router.patch( '/templates/:id',        authenticate, authorize('leave_templates', 'update'), updateTemplateValidator, templateCtrl.update);
router.delete('/templates/:id',        authenticate, authorize('leave_templates', 'delete'), templateCtrl.remove);
router.post(  '/templates/:id/assign', authenticate, authorize('leave_templates', 'assign'), assignTemplateValidator, templateCtrl.assign);

// ─── Leave Balances ─────────────────────────────────────────────────────────
router.get(  '/balances',                 authenticate, authorize('leave_balances', 'view'), balanceCtrl.listAll);
router.get(  '/balances/me',             authenticate, balanceCtrl.getMyBalances);
router.get(  '/balances/:employeeId',     authenticate, authorize('leave_balances', 'view'), balanceCtrl.getEmployeeBalances);
router.patch('/balances/:id/adjust',      authenticate, authorize('leave_balances', 'update'), adjustBalanceValidator, balanceCtrl.adjust);

// ─── Leave Requests ─────────────────────────────────────────────────────────
router.post( '/requests',              authenticate, applyLeaveValidator, requestCtrl.apply);
router.get(  '/requests/me',           authenticate, requestCtrl.myLeaves);
router.get(  '/requests/pending',      authenticate, authorize('leave_requests', 'approve'), requestCtrl.pending);
router.get(  '/requests/all',          authenticate, authorize('leave_requests', 'view'), requestCtrl.listAll);
router.patch('/requests/:id/approve',  authenticate, authorize('leave_requests', 'approve'), reviewValidator, requestCtrl.approve);
router.patch('/requests/:id/reject',   authenticate, authorize('leave_requests', 'reject'), reviewValidator, requestCtrl.reject);
router.patch('/requests/:id/cancel',   authenticate, requestCtrl.cancel);

module.exports = router;
