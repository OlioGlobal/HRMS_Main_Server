const express    = require('express');
const router     = express.Router();
const authenticate = require('../../middleware/authenticate');
const authorize    = require('../../middleware/authorize');
const ctrl       = require('../../controllers/letters/letterTemplate.controller');
const { createLetterTemplateValidator, updateLetterTemplateValidator } = require('../../validators/letters/letterTemplate.validator');

router.get('/',         authenticate, authorize('letter_templates', 'view'),   ctrl.list);
router.get('/:id',      authenticate, authorize('letter_templates', 'view'),   ctrl.getOne);
router.get('/:id/preview', authenticate, authorize('letter_templates', 'view'), ctrl.preview);
router.post('/',        authenticate, authorize('letter_templates', 'create'), createLetterTemplateValidator, ctrl.create);
router.patch('/:id',    authenticate, authorize('letter_templates', 'update'), updateLetterTemplateValidator, ctrl.update);
router.delete('/:id',   authenticate, authorize('letter_templates', 'delete'), ctrl.remove);

module.exports = router;
