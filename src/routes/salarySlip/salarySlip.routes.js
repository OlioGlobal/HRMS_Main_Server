const express = require('express');
const router  = express.Router();

const authenticate = require('../../middleware/authenticate');
const authorize    = require('../../middleware/authorize');
const ctrl         = require('../../controllers/salarySlip/salarySlip.controller');
const { sendSlipValidator } = require('../../validators/salarySlip/salarySlip.validator');

// Manual salary-slip generator. Gated on payroll:view — HR / Accounts only.
// The breakdown structure is derived from existing Salary Grades (percentages
// only, no amounts). The send endpoint stores nothing and logs no amounts.

router.get('/grades',      authenticate, authorize('payroll', 'view'), ctrl.listGrades);
router.get('/grades/:id/breakdown', authenticate, authorize('payroll', 'view'), ctrl.getGradeBreakdown);
router.post('/send',       authenticate, authorize('payroll', 'view'), sendSlipValidator, ctrl.send);

module.exports = router;
