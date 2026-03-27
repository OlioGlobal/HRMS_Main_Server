const express = require('express');
const router  = express.Router();

const authenticate = require('../../middleware/authenticate');
const authorize    = require('../../middleware/authorize');
const ctrl         = require('../../controllers/appraisal/appraisal.controller');
const v            = require('../../validators/appraisal/appraisal.validator');

// ─── Cycles (HR/Admin) ─────────────────────────────────────────────────────
router.get(   '/cycles',                 authenticate, authorize('appraisal_cycles', 'view'),   ctrl.listCycles);
router.post(  '/cycles',                 authenticate, authorize('appraisal_cycles', 'create'), v.createCycleValidator, ctrl.createCycle);
router.get(   '/cycles/:id',            authenticate, authorize('appraisal_cycles', 'view'),   ctrl.getCycle);
router.patch( '/cycles/:id',            authenticate, authorize('appraisal_cycles', 'update'), v.updateCycleValidator, ctrl.updateCycle);
router.delete('/cycles/:id',            authenticate, authorize('appraisal_cycles', 'delete'), ctrl.deleteCycle);
router.patch( '/cycles/:id/activate',   authenticate, authorize('appraisal_cycles', 'create'), ctrl.activateCycle);
router.patch( '/cycles/:id/complete',   authenticate, authorize('appraisal_cycles', 'update'), ctrl.completeCycle);

// ─── Records (HR) ──────────────────────────────────────────────────────────
router.get(   '/cycles/:id/records',                       authenticate, authorize('appraisal_records', 'view'), ctrl.listRecords);
router.get(   '/cycles/:id/records/:empId',                authenticate, authorize('appraisal_records', 'view'), ctrl.getRecord);
router.patch( '/cycles/:id/records/:empId/finalize',       authenticate, authorize('appraisal_records', 'finalize'), v.finalizeValidator, ctrl.finalizeRecord);
router.patch( '/cycles/:id/records/:empId/share',          authenticate, authorize('appraisal_records', 'update'), ctrl.shareRecord);
router.patch( '/cycles/:id/records/:empId/assign-reviewer',authenticate, authorize('appraisal_records', 'update'), v.assignReviewerValidator, ctrl.assignReviewer);

// ─── My Appraisal (Employee — self) ────────────────────────────────────────
router.get(  '/my',                    authenticate, ctrl.getMyAppraisal);
router.get(  '/my/history',            authenticate, ctrl.getMyHistory);
router.post( '/my/:cycleId/self-rating', authenticate, v.selfRatingValidator, ctrl.submitSelfRating);

// ─── Team (Manager) ────────────────────────────────────────────────────────
router.get(  '/team',                              authenticate, ctrl.getTeamAppraisals);
router.post( '/team/:cycleId/:empId/manager-rating', authenticate, v.managerRatingValidator, ctrl.submitManagerRating);

// ─── Goals ─────────────────────────────────────────────────────────────────
router.get(   '/records/:recordId/goals',            authenticate, ctrl.listGoals);
router.post(  '/records/:recordId/goals',            authenticate, v.createGoalValidator, ctrl.createGoal);
router.patch( '/records/:recordId/goals/:goalId',    authenticate, v.updateGoalValidator, ctrl.updateGoal);
router.delete('/records/:recordId/goals/:goalId',    authenticate, ctrl.deleteGoal);
router.patch( '/records/:recordId/goals-submit',     authenticate, ctrl.submitGoals);
router.patch( '/records/:recordId/goals-approve',    authenticate, authorize('appraisal_goals', 'approve'), ctrl.approveGoals);
router.patch( '/records/:recordId/goals-reject',     authenticate, authorize('appraisal_goals', 'approve'), v.rejectGoalsValidator, ctrl.rejectGoals);

// Manager: create same goal for all team members in a cycle
router.post(  '/cycles/:cycleId/goals/team',         authenticate, v.createGoalValidator, ctrl.createGoalForTeam);

// ─── Templates ─────────────────────────────────────────────────────────────
router.get(   '/templates',     authenticate, authorize('appraisal_templates', 'view'),   ctrl.listTemplates);
router.post(  '/templates',     authenticate, authorize('appraisal_templates', 'create'), v.createTemplateValidator, ctrl.createTemplate);
router.patch( '/templates/:id', authenticate, authorize('appraisal_templates', 'update'), v.updateTemplateValidator, ctrl.updateTemplate);
router.delete('/templates/:id', authenticate, authorize('appraisal_templates', 'delete'), ctrl.deleteTemplate);

// ─── Reviewers ───────────────────────────────────────────────────────────
router.get('/reviewers', authenticate, authorize('appraisal_records', 'update'), ctrl.listReviewers);

// ─── Dashboard ─────────────────────────────────────────────────────────────
router.get('/dashboard', authenticate, ctrl.getDashboardAppraisal);

module.exports = router;
