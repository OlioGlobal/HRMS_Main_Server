const express = require('express');
const router  = express.Router();
const ctrl    = require('../../controllers/preboarding/preboarding.controller');

// All routes are PUBLIC — no authenticate middleware
// Token is validated inside each service method

router.get('/checklist',          ctrl.getChecklist);
router.post('/accept-letter',     ctrl.acceptLetter);
router.post('/decline-letter',    ctrl.declineLetter);
router.post('/acknowledge-policy',ctrl.acknowledgePolicy);
router.post('/personal-details',  ctrl.savePersonalDetails);

module.exports = router;
