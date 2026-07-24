const express = require('express');
const router  = express.Router();

const authenticate  = require('../../middleware/authenticate');
const dashboardCtrl = require('../../controllers/dashboard/dashboard.controller');

// GET /api/dashboard/stats
router.get('/stats', authenticate, dashboardCtrl.getStats);

// GET /api/dashboard/birthdays?scope=company|department|team|location|reportees&days=7
router.get('/birthdays', authenticate, dashboardCtrl.getBirthdays);

module.exports = router;
