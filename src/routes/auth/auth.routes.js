const express    = require('express');
const router     = express.Router();
const controller = require('../../controllers/auth/auth.controller');
const authenticate = require('../../middleware/authenticate');
const { signupValidator, loginValidator } = require('../../validators/auth/auth.validator');

// Public
router.post('/signup',          signupValidator, controller.signup);
router.post('/login',           loginValidator,  controller.login);
router.post('/refresh',                          controller.refresh);
router.post('/forgot-password',                  controller.forgotPassword);
router.post('/reset-password',                   controller.resetPassword);

// Protected
router.post('/logout',     authenticate, controller.logout);
router.get('/me',          authenticate, controller.getMe);
router.patch('/preference', authenticate, controller.updatePreference);

module.exports = router;
