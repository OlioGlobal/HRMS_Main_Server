const express = require('express');
const router  = express.Router();

const authenticate = require('../../middleware/authenticate');
const authorize    = require('../../middleware/authorize');
const ctrl         = require('../../controllers/holiday/holiday.controller');
const {
  createHolidayValidator,
  updateHolidayValidator,
  bulkCreateValidator,
  fetchNagerValidator,
} = require('../../validators/holiday/holiday.validator');

// ─── CRUD ──────────────────────────────────────────────────────────────────────
router.get(   '/',    authenticate, authorize('holidays', 'view'),   ctrl.list);
router.post(  '/',    authenticate, authorize('holidays', 'create'), createHolidayValidator, ctrl.create);
router.post(  '/bulk',authenticate, authorize('holidays', 'create'), bulkCreateValidator, ctrl.bulkCreate);
router.get(   '/import', authenticate, authorize('holidays', 'create'), fetchNagerValidator, ctrl.fetchNager);
router.get(   '/:id', authenticate, authorize('holidays', 'view'),   ctrl.get);
router.patch( '/:id', authenticate, authorize('holidays', 'update'), updateHolidayValidator, ctrl.update);
router.delete('/:id', authenticate, authorize('holidays', 'delete'), ctrl.remove);

// ─── Optional holiday picks ─────────────────────────────────────────────────
router.get(   '/optional/:employeeId',            authenticate, ctrl.getOptionalPicks);
router.post(  '/optional/:employeeId/:holidayId', authenticate, ctrl.pickOptional);
router.delete('/optional/:employeeId/:holidayId', authenticate, ctrl.unpickOptional);

module.exports = router;
