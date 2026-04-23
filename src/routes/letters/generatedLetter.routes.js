const express      = require('express');
const router       = express.Router();
const authenticate = require('../../middleware/authenticate');
const authorize    = require('../../middleware/authorize');
const ctrl         = require('../../controllers/letters/generatedLetter.controller');
const { generateLetterValidator } = require('../../validators/letters/generatedLetter.validator');

router.get('/',                authenticate, authorize('letters', 'view'),   ctrl.list);
router.get('/:id',             authenticate, authorize('letters', 'view'),   ctrl.getOne);
router.post('/generate',       authenticate, authorize('letters', 'create'), generateLetterValidator, ctrl.generate);
router.post('/preview',        authenticate, authorize('letters', 'view'),   ctrl.preview);
router.post('/build-preview',  authenticate, authorize('letters', 'view'),   ctrl.buildPreview);
router.post('/:id/send',       authenticate, authorize('letters', 'send'),   ctrl.send);
router.patch('/:id',           authenticate, authorize('letters', 'update'), ctrl.updateDraft);
router.delete('/:id',          authenticate, authorize('letters', 'delete'), ctrl.remove);

module.exports = router;
