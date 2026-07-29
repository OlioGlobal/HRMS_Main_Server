const express          = require('express');
const router           = express.Router();
const ctrl             = require('../../controllers/admin/adminAuth.controller');
const authenticateAdmin = require('../../middleware/authenticateAdmin');
const { loginValidator } = require('../../validators/admin/adminAuth.validator');

router.post('/login',   loginValidator, ctrl.login);
router.post('/refresh', ctrl.refresh);
router.post('/logout',  authenticateAdmin, ctrl.logout);
router.get('/me',       authenticateAdmin, ctrl.getMe);

module.exports = router;
