const express           = require('express');
const router            = express.Router();
const ctrl              = require('../../controllers/admin/analytics.controller');
const authenticateAdmin = require('../../middleware/authenticateAdmin');

router.get('/', authenticateAdmin, ctrl.getStats);

module.exports = router;
