const express = require('express');
const router  = express.Router();

const authenticate = require('../../middleware/authenticate');
const authorize    = require('../../middleware/authorize');

const attendanceCtrl     = require('../../controllers/attendance/attendance.controller');
const regularizationCtrl = require('../../controllers/attendance/regularization.controller');

const {
  clockInValidator,
  clockOutValidator,
  overrideValidator,
  regularizationSubmitValidator,
  reviewValidator,
} = require('../../validators/attendance/attendance.validator');

// ─── Attendance ──────────────────────────────────────────────────────────────
router.post('/clock-in',  authenticate, clockInValidator,  attendanceCtrl.clockIn);
router.post('/clock-out', authenticate, clockOutValidator, attendanceCtrl.clockOut);
router.get( '/today',     authenticate, attendanceCtrl.getToday);
router.get( '/my',        authenticate, attendanceCtrl.getMyAttendance);
router.get( '/detect-location', authenticate, attendanceCtrl.detectLocation);

// HR / Manager routes
router.get(  '/',                       authenticate, authorize('attendance', 'view'),   attendanceCtrl.listAttendance);
router.get(  '/:employeeId/monthly',    authenticate, authorize('attendance', 'view'),   attendanceCtrl.getMonthlySummary);
router.patch('/:id/override',           authenticate, authorize('attendance', 'update'), overrideValidator, attendanceCtrl.override);

// ─── Regularization ──────────────────────────────────────────────────────────
router.post( '/regularization',              authenticate, regularizationSubmitValidator, regularizationCtrl.submit);
router.get(  '/regularization/my',           authenticate, regularizationCtrl.myRequests);
router.get(  '/regularization',              authenticate, authorize('attendance_regularization', 'view'), regularizationCtrl.listAll);
router.patch('/regularization/:id/approve',  authenticate, authorize('attendance_regularization', 'approve'), reviewValidator, regularizationCtrl.approve);
router.patch('/regularization/:id/reject',   authenticate, authorize('attendance_regularization', 'reject'),  reviewValidator, regularizationCtrl.reject);
router.patch('/regularization/:id/cancel',   authenticate, regularizationCtrl.cancel);

module.exports = router;
