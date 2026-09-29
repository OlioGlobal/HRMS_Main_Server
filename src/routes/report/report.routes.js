const express = require('express');
const router  = express.Router();

const authenticate = require('../../middleware/authenticate');
const authorize    = require('../../middleware/authorize');
const ctrl         = require('../../controllers/report/report.controller');

// ─── Reports (Excel export) ──────────────────────────────────────────────────
router.get('/attendance/export', authenticate, authorize('attendance', 'export'), ctrl.exportAttendance);
router.get('/payroll/export',    authenticate, authorize('payroll', 'export'),    ctrl.exportPayroll);

module.exports = router;
