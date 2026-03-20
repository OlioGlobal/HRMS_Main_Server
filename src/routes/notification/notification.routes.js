const express      = require('express');
const router       = express.Router();
const notifCtrl    = require('../../controllers/notification/notification.controller');
const ruleCtrl     = require('../../controllers/notification/rule.controller');
const authenticate = require('../../middleware/authenticate');
const authorize    = require('../../middleware/authorize');
const {
  listNotificationsValidator,
  updateRuleValidator,
} = require('../../validators/notification/notification.validator');

// ─── Notifications (all authenticated users) ─────────────────────────────────
router.get('/',
  authenticate,
  listNotificationsValidator,
  notifCtrl.listNotifications,
);

router.get('/unread-count',
  authenticate,
  notifCtrl.getUnreadCount,
);

router.patch('/read-all',
  authenticate,
  notifCtrl.markAllRead,
);

router.patch('/:id/read',
  authenticate,
  notifCtrl.markRead,
);

router.delete('/:id',
  authenticate,
  notifCtrl.deleteNotification,
);

// ─── Notification Rules (admin only) ─────────────────────────────────────────
router.get('/rules',
  authenticate, authorize('notification_rules', 'view'),
  ruleCtrl.listRules,
);

router.get('/rules/:id',
  authenticate, authorize('notification_rules', 'view'),
  ruleCtrl.getRuleById,
);

router.patch('/rules/:id',
  authenticate, authorize('notification_rules', 'update'),
  updateRuleValidator,
  ruleCtrl.updateRule,
);

router.get('/rules/:id/executions',
  authenticate, authorize('notification_rules', 'view'),
  ruleCtrl.getRuleExecutions,
);

module.exports = router;
