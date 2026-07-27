const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const ctrl    = require('../../controllers/preboarding/preboarding.controller');

// Multer — store in memory (then upload to B2)
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 15 * 1024 * 1024 }, // 15MB max
});

// All routes are PUBLIC — no authenticate middleware
// Token is validated inside each service method

router.get('/checklist',          ctrl.getChecklist);
router.post('/accept-letter',     ctrl.acceptLetter);
router.post('/decline-letter',    ctrl.declineLetter);
router.post('/upload-signed-letter', upload.single('file'), ctrl.uploadSignedLetter);
router.post('/acknowledge-policy',ctrl.acknowledgePolicy);
router.post('/personal-details',  ctrl.savePersonalDetails);

module.exports = router;
