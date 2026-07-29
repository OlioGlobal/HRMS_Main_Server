const express = require('express');
const router  = express.Router();

const adminAuthRoutes = require('./adminAuth.routes');
const planRoutes      = require('./plan.routes');
const tenantRoutes    = require('./tenant.routes');
const analyticsRoutes = require('./analytics.routes');

router.use('/auth',      adminAuthRoutes);
router.use('/plans',     planRoutes);
router.use('/tenants',   tenantRoutes);
router.use('/analytics', analyticsRoutes);

module.exports = router;
