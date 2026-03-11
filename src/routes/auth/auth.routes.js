const express    = require('express');
const router     = express.Router();
const controller = require('../../controllers/auth/auth.controller');
const authenticate = require('../../middleware/authenticate');
const { signupValidator, loginValidator } = require('../../validators/auth/auth.validator');

// Public
router.post('/signup',  signupValidator, controller.signup);
router.post('/login',   loginValidator,  controller.login);
router.post('/refresh',                  controller.refresh);

// Protected
router.post('/logout', authenticate, controller.logout);
router.get('/me',      authenticate, controller.getMe);

module.exports = router;
