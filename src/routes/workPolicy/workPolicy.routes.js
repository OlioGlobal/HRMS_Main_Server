const express      = require('express');
const router       = express.Router();
const ctrl         = require('../../controllers/workPolicy/workPolicy.controller');
const authenticate = require('../../middleware/authenticate');
const authorize    = require('../../middleware/authorize');
const { createWorkPolicyValidator, updateWorkPolicyValidator } = require('../../validators/workPolicy/workPolicy.validator');

router.get('/',
  authenticate, authorize('work_policies', 'view'),
  ctrl.listWorkPolicies
);

router.get('/:id',
  authenticate, authorize('work_policies', 'view'),
  ctrl.getWorkPolicy
);

router.post('/',
  authenticate, authorize('work_policies', 'create'),
  createWorkPolicyValidator,
  ctrl.createWorkPolicy
);

router.patch('/:id',
  authenticate, authorize('work_policies', 'update'),
  updateWorkPolicyValidator,
  ctrl.updateWorkPolicy
);

router.delete('/:id',
  authenticate, authorize('work_policies', 'delete'),
  ctrl.deleteWorkPolicy
);

module.exports = router;
