const express      = require('express');
const router       = express.Router();
const ctrl         = require('../../controllers/permissions/permission.controller');
const authenticate = require('../../middleware/authenticate');
const authorize    = require('../../middleware/authorize');

// GET /api/permissions — all system permissions grouped by module
router.get('/',
  authenticate, authorize('permissions', 'view'),
  ctrl.listPermissions
);

module.exports = router;
