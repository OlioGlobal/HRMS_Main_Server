const express = require('express');
const router  = express.Router();

const authenticate = require('../../middleware/authenticate');
const authorize    = require('../../middleware/authorize');
const ctrl         = require('../../controllers/payroll/payroll.controller');
const { initiateRunValidator, editRecordValidator } = require('../../validators/payroll/payroll.validator');

// ─── Payslips (Employee Self) ───────────────────────────────────────────────
router.get('/payslips/me', authenticate, ctrl.getMyPayslips);

// ─── Payroll Runs ───────────────────────────────────────────────────────────
router.get(   '/',                authenticate, authorize('payroll', 'view'),    ctrl.listRuns);
router.post(  '/',                authenticate, authorize('payroll', 'create'),  initiateRunValidator, ctrl.initiateRun);
router.get(   '/:id',             authenticate, authorize('payroll', 'view'),    ctrl.getRun);
router.delete('/:id',             authenticate, authorize('payroll', 'delete'),  ctrl.deleteRun);
router.post(  '/:id/process',     authenticate, authorize('payroll', 'create'),  ctrl.processRun);
router.patch( '/:id/approve',     authenticate, authorize('payroll', 'approve'), ctrl.approveRun);
router.patch( '/:id/mark-paid',   authenticate, authorize('payroll', 'approve'), ctrl.markPaid);

// ─── Payroll Records ────────────────────────────────────────────────────────
router.get(   '/:id/records',            authenticate, authorize('payroll', 'view'),   ctrl.getRecords);
router.get(   '/:id/records/:empId',     authenticate, authorize('payroll', 'view'),   ctrl.getRecord);
router.patch( '/:id/records/:empId',     authenticate, authorize('payroll', 'update'), editRecordValidator, ctrl.editRecord);
router.patch( '/:id/records/:empId/skip', authenticate, authorize('payroll', 'update'), ctrl.skipRecord);

module.exports = router;
