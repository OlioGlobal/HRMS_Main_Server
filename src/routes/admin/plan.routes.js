const express           = require('express');
const router            = express.Router();
const ctrl              = require('../../controllers/admin/plan.controller');
const authenticateAdmin = require('../../middleware/authenticateAdmin');
const { createPlanValidator, updatePlanValidator } = require('../../validators/admin/plan.validator');

router.get('/',        authenticateAdmin, ctrl.list);
router.get('/:id',     authenticateAdmin, ctrl.getOne);
router.post('/',       authenticateAdmin, createPlanValidator, ctrl.create);
router.patch('/:id',   authenticateAdmin, updatePlanValidator, ctrl.update);
router.delete('/:id',  authenticateAdmin, ctrl.remove);

module.exports = router;
