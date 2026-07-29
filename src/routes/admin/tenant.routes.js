const express           = require('express');
const router            = express.Router();
const ctrl              = require('../../controllers/admin/tenant.controller');
const authenticateAdmin = require('../../middleware/authenticateAdmin');
const { assignPlanValidator } = require('../../validators/admin/tenant.validator');

router.get('/',                   authenticateAdmin, ctrl.list);
router.get('/:id',                authenticateAdmin, ctrl.getOne);
router.get('/:id/history',        authenticateAdmin, ctrl.history);
router.patch('/:id/assign-plan',  authenticateAdmin, assignPlanValidator, ctrl.assignPlan);
router.patch('/:id/deactivate',   authenticateAdmin, ctrl.deactivate);
router.patch('/:id/activate',     authenticateAdmin, ctrl.activate);

module.exports = router;
