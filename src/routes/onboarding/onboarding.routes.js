const express      = require('express');
const router       = express.Router();
const ctrl         = require('../../controllers/onboarding/onboarding.controller');
const authenticate = require('../../middleware/authenticate');
const authorize    = require('../../middleware/authorize');
const { updateOffboardingChecklistValidator } = require('../../validators/onboarding/onboarding.validator');

// ─── Onboarding ────────────────────────────────────────────────────────────────
router.get('/onboarding',
  authenticate, authorize('onboarding', 'view'),
  ctrl.getOnboardingList
);

router.patch('/onboarding/:id/complete',
  authenticate, authorize('onboarding', 'update'),
  ctrl.completeOnboarding
);

// ─── Offboarding ───────────────────────────────────────────────────────────────
router.get('/offboarding',
  authenticate, authorize('offboarding', 'view'),
  ctrl.getOffboardingList
);

router.patch('/offboarding/:id',
  authenticate, authorize('offboarding', 'update'),
  updateOffboardingChecklistValidator,
  ctrl.updateOffboardingChecklist
);

router.patch('/offboarding/:id/complete',
  authenticate, authorize('offboarding', 'update'),
  ctrl.completeOffboarding
);

module.exports = router;
