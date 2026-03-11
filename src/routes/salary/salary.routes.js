const express = require('express');
const router  = express.Router();

const authenticate = require('../../middleware/authenticate');
const authorize    = require('../../middleware/authorize');

const compCtrl  = require('../../controllers/salary/salaryComponent.controller');
const gradeCtrl = require('../../controllers/salary/salaryGrade.controller');
const empCtrl   = require('../../controllers/salary/employeeSalary.controller');

const { seedDefaultSalaryComponents } = require('../../seeders/salaryComponents.seeder');
const catchAsync = require('../../utils/catchAsync');
const { sendSuccess } = require('../../utils/response');

const {
  createComponentValidator,
  updateComponentValidator,
  createGradeValidator,
  updateGradeValidator,
  assignSalaryValidator,
} = require('../../validators/salary/salary.validator');

// ─── Seed default components (one-time, for existing companies) ─────────────
router.post('/components/seed', authenticate, authorize('salary_components', 'create'), catchAsync(async (req, res) => {
  await seedDefaultSalaryComponents(req.user.companyId);
  sendSuccess(res, {}, 'Default salary components seeded.');
}));

// ─── Salary Components ──────────────────────────────────────────────────────
router.get(   '/components',     authenticate, authorize('salary_components', 'view'),   compCtrl.list);
router.post(  '/components',     authenticate, authorize('salary_components', 'create'), createComponentValidator, compCtrl.create);
router.get(   '/components/:id', authenticate, authorize('salary_components', 'view'),   compCtrl.get);
router.patch( '/components/:id', authenticate, authorize('salary_components', 'update'), updateComponentValidator, compCtrl.update);
router.delete('/components/:id', authenticate, authorize('salary_components', 'delete'), compCtrl.remove);

// ─── Salary Grades ──────────────────────────────────────────────────────────
router.get(   '/grades',     authenticate, authorize('salary_grades', 'view'),   gradeCtrl.list);
router.post(  '/grades',     authenticate, authorize('salary_grades', 'create'), createGradeValidator, gradeCtrl.create);
router.get(   '/grades/:id', authenticate, authorize('salary_grades', 'view'),   gradeCtrl.get);
router.patch( '/grades/:id', authenticate, authorize('salary_grades', 'update'), updateGradeValidator, gradeCtrl.update);
router.delete('/grades/:id', authenticate, authorize('salary_grades', 'delete'), gradeCtrl.remove);

// ─── Employee Salary ────────────────────────────────────────────────────────
router.get(  '/employee/:employeeId',        authenticate, authorize('employee_salary', 'view'),   empCtrl.listForEmployee);
router.get(  '/employee/:employeeId/active',  authenticate, authorize('employee_salary', 'view'),   empCtrl.getActive);
router.post( '/employee/:employeeId/assign',  authenticate, authorize('employee_salary', 'create'), assignSalaryValidator, empCtrl.assign);

module.exports = router;
