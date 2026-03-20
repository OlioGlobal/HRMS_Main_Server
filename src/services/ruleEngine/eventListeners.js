const eventBus = require('../../utils/eventBus');
const { notificationQueue } = require('../../utils/queue');

/**
 * Maps application events to notification rule slugs.
 * When an event fires on the eventBus, the corresponding rule is queued for execution.
 */
const EVENT_RULE_MAP = {
  'leave.applied':   'leave-notification',
  'leave.approved':  'leave-notification',
  'leave.rejected':  'leave-notification',
  'leave.cancelled': 'leave-notification',
  'payroll.paid':    'payslip-ready',
};

Object.entries(EVENT_RULE_MAP).forEach(([event, slug]) => {
  eventBus.on(event, (data) => {
    if (!data || !data.companyId) {
      console.warn(`[RuleEngine] Event ${event} fired without companyId — skipping`);
      return;
    }

    notificationQueue
      .add(
        `event:${slug}`,
        { ...data, eventName: event },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        }
      )
      .catch((err) => {
        console.error(`[RuleEngine] Failed to queue event ${event}:`, err.message);
      });
  });
});

console.log('[RuleEngine] Event listeners registered');
