const express      = require('express');
const router       = express.Router();
const authenticate = require('../../middleware/authenticate');
const authorize    = require('../../middleware/authorize');
const ctrl         = require('../../controllers/hiring/candidates.controller');
const { createCandidateValidator, updateCandidateValidator } = require('../../validators/hiring/candidates.validator');

// GET    /hiring/candidates/hr-users — list HR staff for assignment dropdown
router.get('/hr-users',   authenticate, authorize('hiring', 'view'),   ctrl.getHrUsers);

// GET    /hiring/candidates         — list all candidates
router.get('/',           authenticate, authorize('hiring', 'view'),   ctrl.listCandidates);

// POST   /hiring/candidates         — add a new candidate
router.post('/',          authenticate, authorize('hiring', 'create'), createCandidateValidator, ctrl.createCandidate);

// PATCH  /hiring/candidates/:id/advance  — move to next pipeline step
router.patch('/:id/advance',  authenticate, authorize('hiring', 'update'), ctrl.advanceCandidate);

// PATCH  /hiring/candidates/:id/activate — convert to full active employee
router.patch('/:id/activate', authenticate, authorize('hiring', 'update'), ctrl.activateCandidate);

// PATCH  /hiring/candidates/:id/override-preboarding — mark pre-boarding complete (skip missing docs)
router.patch('/:id/override-preboarding', authenticate, authorize('hiring', 'update'), ctrl.overridePreboarding);

// PATCH  /hiring/candidates/:id     — update candidate fields
router.patch('/:id',      authenticate, authorize('hiring', 'update'), updateCandidateValidator, ctrl.updateCandidate);

// DELETE /hiring/candidates/:id     — reject / remove candidate
router.delete('/:id',     authenticate, authorize('hiring', 'delete'), ctrl.removeCandidate);

module.exports = router;
