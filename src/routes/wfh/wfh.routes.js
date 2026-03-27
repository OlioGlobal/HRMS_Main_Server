const express = require('express');
const router  = express.Router();

const authenticate = require('../../middleware/authenticate');
const authorize    = require('../../middleware/authorize');

const ctrl = require('../../controllers/wfh/wfh.controller');
const { applyValidator, rejectValidator } = require('../../validators/wfh/wfh.validator');

// ─── Employee self-service ───────────────────────────────────────────────────
router.post('/',    authenticate, applyValidator, ctrl.apply);
router.get( '/my',  authenticate, ctrl.myRequests);

// ─── Email action route (no cookie auth, uses JWT token + action in query) ──
router.get('/action', async (req, res) => {
  const { action } = req.query;
  if (action === 'reject') return ctrl.rejectFromEmail(req, res);
  return ctrl.approveFromEmail(req, res);
});

// ─── Manager / HR ────────────────────────────────────────────────────────────
router.get(  '/',            authenticate, authorize('wfh_requests', 'view'),    ctrl.listRequests);
router.patch('/:id/approve', authenticate, authorize('wfh_requests', 'approve'), ctrl.approve);
router.patch('/:id/reject',  authenticate, authorize('wfh_requests', 'reject'),  rejectValidator, ctrl.reject);
router.patch('/:id/cancel',  authenticate, ctrl.cancel);

module.exports = router;
