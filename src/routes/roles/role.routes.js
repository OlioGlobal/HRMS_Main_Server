const express    = require('express');
const router     = express.Router();
const ctrl       = require('../../controllers/roles/role.controller');
const authenticate = require('../../middleware/authenticate');
const authorize    = require('../../middleware/authorize');
const {
  createRoleValidator,
  updateRoleValidator,
  updatePermissionsValidator,
  assignRoleValidator,
} = require('../../validators/roles/role.validator');

// ─── Role CRUD ─────────────────────────────────────────────────────────────────
router.get('/',
  authenticate, authorize('roles', 'view'),
  ctrl.listRoles
);

router.get('/:id',
  authenticate, authorize('roles', 'view'),
  ctrl.getRole
);

router.post('/',
  authenticate, authorize('roles', 'create'),
  createRoleValidator,
  ctrl.createRole
);

router.patch('/:id',
  authenticate, authorize('roles', 'update'),
  updateRoleValidator,
  ctrl.updateRole
);

router.delete('/:id',
  authenticate, authorize('roles', 'delete'),
  ctrl.deleteRole
);

// ─── Role Permissions ──────────────────────────────────────────────────────────
router.get('/:id/permissions',
  authenticate, authorize('roles', 'view'),
  ctrl.getRolePermissions
);

router.put('/:id/permissions',
  authenticate, authorize('roles', 'update'),
  updatePermissionsValidator,
  ctrl.updateRolePermissions
);

// ─── User ↔ Role Assignment ────────────────────────────────────────────────────
router.get('/users/:userId',
  authenticate, authorize('roles', 'view'),
  ctrl.getUserRoles
);

router.post('/users/:userId',
  authenticate, authorize('roles', 'assign'),
  assignRoleValidator,
  ctrl.assignRole
);

router.delete('/users/:userId/:roleId',
  authenticate, authorize('roles', 'assign'),
  ctrl.revokeRole
);

module.exports = router;
