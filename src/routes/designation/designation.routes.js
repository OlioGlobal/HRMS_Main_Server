const express = require('express');
const router  = express.Router();

const authenticate = require('../../middleware/authenticate');
const authorize    = require('../../middleware/authorize');
const ctrl         = require('../../controllers/designation/designation.controller');
const {
  createDesignationValidator,
  updateDesignationValidator,
} = require('../../validators/designation/designation.validator');

router.get(   '/',    authenticate, authorize('designations', 'view'),   ctrl.list);
router.post(  '/',    authenticate, authorize('designations', 'create'), createDesignationValidator, ctrl.create);
router.get(   '/:id', authenticate, authorize('designations', 'view'),   ctrl.get);
router.patch( '/:id', authenticate, authorize('designations', 'update'), updateDesignationValidator, ctrl.update);
router.delete('/:id', authenticate, authorize('designations', 'delete'), ctrl.remove);

module.exports = router;
