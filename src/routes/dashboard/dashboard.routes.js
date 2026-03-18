const express = require('express');
const router  = express.Router();

const authenticate  = require('../../middleware/authenticate');
const dashboardCtrl = require('../../controllers/dashboard/dashboard.controller');

// GET /api/dashboard/stats
router.get('/stats', authenticate, dashboardCtrl.getStats);

module.exports = router;
