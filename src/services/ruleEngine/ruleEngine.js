const Handlebars = require('handlebars');
const NotificationRule = require('../../models/NotificationRule');
const Notification = require('../../models/Notification');
const RuleExecution = require('../../models/RuleExecution');
const Employee = require('../../models/Employee');
const UserRole = require('../../models/UserRole');
const Role = require('../../models/Role');
const registry = require('./registry');
const { sendEmail, compileTemplate } = require('../../utils/email');

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Get start-of-day Date for deduplication checks (UTC).
 */
const startOfDayUTC = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

/**
 * Compile a Handlebars template string with given variables.
 * Returns the compiled string, or the raw template on error.
 */
const compile = (templateStr, variables) => {
  if (!templateStr) return '';
  try {
    const tpl = Handlebars.compile(templateStr);
    return tpl(variables || {});
  } catch (err) {
    console.error('[RuleEngine] Template compile error:', err.message);
    return templateStr;
  }
};

// ── Recipient Resolution ───────────────────────────────────────────────────────

/**
 * Resolve user IDs for a given employee: the employee themselves, their manager, and HR users.
 *
 * @param {string} companyId
 * @param {string} employeeId - The Employee._id to resolve around
 * @returns {{ employee, manager, hrUsers }} where each is { userId, email } or array thereof
 */
const resolveRecipients = async (companyId, employeeId) => {
  const result = { employee: null, manager: null, hrUsers: [] };

  // 1. Employee themselves
  const emp = await Employee.findOne({ _id: employeeId, company_id: companyId })
    .select('user_id email firstName lastName reportingManager_id')
    .lean();

  if (!emp) return result;

  if (emp.user_id) {
    result.employee = {
      userId: emp.user_id,
      email: emp.email,
      employeeName: `${emp.firstName} ${emp.lastName}`,
    };
  }

  // 2. Reporting manager
  if (emp.reportingManager_id) {
    const mgr = await Employee.findOne({
      _id: emp.reportingManager_id,
      company_id: companyId,
    })
      .select('user_id email firstName lastName')
      .lean();

    if (mgr && mgr.user_id) {
      result.manager = {
        userId: mgr.user_id,
        email: mgr.email,
        employeeName: `${mgr.firstName} ${mgr.lastName}`,
      };
    }
  }

  // 3. HR users (HR Manager + HR Staff roles)
  try {
    const hrRoles = await Role.find({
      company_id: companyId,
      slug: { $in: ['hr-manager', 'hr-staff'] },
      isActive: true,
    })
      .select('_id')
      .lean();

    if (hrRoles.length > 0) {
      const hrRoleIds = hrRoles.map((r) => r._id);
      const hrUserRoles = await UserRole.find({
        company_id: companyId,
        role_id: { $in: hrRoleIds },
      })
        .select('user_id')
        .lean();

      // Deduplicate user IDs
      const seen = new Set();
      for (const ur of hrUserRoles) {
        const uid = ur.user_id.toString();
        if (seen.has(uid)) continue;
        seen.add(uid);

        // Get the employee record for this user to get their email
        const hrEmp = await Employee.findOne({
          user_id: ur.user_id,
          company_id: companyId,
        })
          .select('email firstName lastName')
          .lean();

        result.hrUsers.push({
          userId: ur.user_id,
          email: hrEmp?.email || null,
          employeeName: hrEmp ? `${hrEmp.firstName} ${hrEmp.lastName}` : 'HR',
        });
      }
    }
  } catch (err) {
    console.error('[RuleEngine] Error resolving HR users:', err.message);
  }

  return result;
};

// ── Core Engine ────────────────────────────────────────────────────────────────

/**
 * Execute a notification rule for a company.
 *
 * @param {string} companyId
 * @param {string} ruleSlug
 * @param {object} contextData - Extra data passed from event or cron handler
 * @returns {{ skipped, notificationsCreated, emailsSent, emailsFailed }}
 */
const executeRule = async (companyId, ruleSlug, contextData = {}) => {
  const startTime = Date.now();
  const stats = { skipped: false, notificationsCreated: 0, emailsSent: 0, emailsFailed: 0 };

  // 1. Fetch rule
  const rule = await NotificationRule.findOne({ company_id: companyId, slug: ruleSlug }).lean();
  if (!rule) {
    return { ...stats, skipped: true, reason: 'rule_not_found' };
  }

  // 2. Check enabled
  if (!rule.isEnabled) {
    return { ...stats, skipped: true, reason: 'disabled' };
  }

  // 3. Dedup for cron rules: check if already ran successfully today (skip for frequent rules like shift-notification)
  if (rule.triggerType === 'cron' && !contextData?._skipDedup) {
    const todayStart = startOfDayUTC();
    const existingExecution = await RuleExecution.findOne({
      company_id: companyId,
      ruleSlug,
      status: 'success',
      triggeredAt: { $gte: todayStart },
    }).lean();

    if (existingExecution) {
      return { ...stats, skipped: true, reason: 'already_ran_today' };
    }
  }

  // 4. Get handler
  const handler = registry[ruleSlug];
  if (!handler || typeof handler.findRecipients !== 'function') {
    console.error(`[RuleEngine] No handler found for slug: ${ruleSlug}`);
    await createExecutionLog(companyId, rule, startTime, stats, 'failed', `No handler for ${ruleSlug}`);
    return { ...stats, skipped: true, reason: 'no_handler' };
  }

  let recipientGroups;
  try {
    // 5. Handler returns array of recipient groups, each with:
    //    { employeeId, templateVars: {...}, recipients: { employee, manager, hrUsers } }
    //    OR simple array of { userId, email, templateVars }
    recipientGroups = await handler.findRecipients(companyId, contextData, rule.config);
  } catch (err) {
    console.error(`[RuleEngine] Handler ${ruleSlug} findRecipients error:`, err.message);
    await createExecutionLog(companyId, rule, startTime, stats, 'failed', err.message);
    return stats;
  }

  if (!recipientGroups || recipientGroups.length === 0) {
    await createExecutionLog(companyId, rule, startTime, stats, 'success', null);
    await NotificationRule.updateOne({ _id: rule._id }, { lastRunAt: new Date() });
    return stats;
  }

  // 6. Pre-fetch emails for all recipients (for email channel)
  let userEmailMap = new Map();
  if (rule.channels.email) {
    const allUserIds = [...new Set(recipientGroups.map(g => g.userId?.toString()).filter(Boolean))];
    if (allUserIds.length > 0) {
      const User = require('../../models/User');
      const users = await User.find({ _id: { $in: allUserIds } }).select('_id email').lean();
      userEmailMap = new Map(users.map(u => [u._id.toString(), u.email]));
    }
  }

  // 7. Build notifications + emails
  const notifications = [];
  const emailTasks = [];

  for (const group of recipientGroups) {
    const templateVars = group.templateVars || group.variables || {};

    // Collect target users based on rule.recipients config
    const targets = [];

    if (rule.recipients.employee && group.recipients?.employee) {
      targets.push(group.recipients.employee);
    }
    if (rule.recipients.manager && group.recipients?.manager) {
      targets.push(group.recipients.manager);
    }
    if (rule.recipients.hr && group.recipients?.hrUsers?.length > 0) {
      targets.push(...group.recipients.hrUsers);
    }

    // If handler returns flat userId list (for simple cases like event-based)
    if (!group.recipients && group.userId) {
      targets.push(group);
    }

    // Deduplicate by userId
    const seen = new Set();
    for (const target of targets) {
      if (!target || !target.userId) continue;
      const uid = target.userId.toString();
      if (seen.has(uid)) continue;
      seen.add(uid);

      // 7a. Check repeat interval + max notifications per user
      if (rule.config.repeatIntervalDays || rule.config.maxNotifications) {
        const pastNotifs = await Notification.find({
          company_id: companyId,
          user_id: target.userId,
          rule_id: rule._id,
        }).sort({ createdAt: -1 }).select('createdAt').lean();

        // Max notifications reached
        if (rule.config.maxNotifications && pastNotifs.length >= rule.config.maxNotifications) {
          continue;
        }

        // Interval not passed since last notification
        if (rule.config.repeatIntervalDays && pastNotifs.length > 0) {
          const lastSent = new Date(pastNotifs[0].createdAt);
          const daysSinceLast = Math.floor((Date.now() - lastSent.getTime()) / (1000 * 60 * 60 * 24));
          if (daysSinceLast < rule.config.repeatIntervalDays) {
            continue;
          }
        }
      }

      // 7b. Compile in-app notification
      if (rule.channels.inApp) {
        const title = compile(rule.templates?.inApp?.title || '', templateVars);
        const body = compile(rule.templates?.inApp?.body || '', templateVars);

        notifications.push({
          company_id: companyId,
          user_id: target.userId,
          rule_id: rule._id,
          title,
          body,
          type: 'info',
          actionUrl: group.actionUrl || templateVars.actionUrl || null,
          metadata: { ruleSlug, ...templateVars },
        });
      }

      // 8. Queue email if channel enabled
      if (rule.channels.email) {
        const email = target.email || userEmailMap.get(uid);
        if (email) {
          const subject = compile(rule.templates?.email?.subject || '', templateVars);
          const html = compile(rule.templates?.email?.body || '', templateVars);
          emailTasks.push({ to: email, subject, html });
        }
      }
    }
  }

  // 8b. Send CC emails (extra recipients configured by admin)
  if (rule.channels.email && rule.recipients.ccEmails?.length > 0 && recipientGroups.length > 0) {
    // Use variables from first group but strip action URLs (CC shouldn't approve/reject)
    const firstVars = { ...(recipientGroups[0].templateVars || recipientGroups[0].variables || {}) };
    delete firstVars.approveUrl;
    delete firstVars.rejectUrl;
    const subject = compile(rule.templates?.email?.subject || '', firstVars);
    const html = compile(rule.templates?.email?.body || '', firstVars);
    for (const ccEmail of rule.recipients.ccEmails) {
      if (ccEmail && ccEmail.includes('@')) {
        emailTasks.push({ to: ccEmail.trim(), subject, html });
      }
    }
  }

  // 9. Bulk insert notifications
  if (notifications.length > 0) {
    try {
      const inserted = await Notification.insertMany(notifications, { ordered: false });
      stats.notificationsCreated = inserted.length;
    } catch (err) {
      console.error(`[RuleEngine] Notification insert error for ${ruleSlug}:`, err.message);
      // Partial inserts still count
      stats.notificationsCreated = err.insertedDocs?.length ?? 0;
    }
  }

  // 10. Send emails (fire-and-forget, track counts)
  if (emailTasks.length > 0) {
    const emailResults = await Promise.allSettled(
      emailTasks.map((task) => sendEmail(task))
    );

    for (const result of emailResults) {
      if (result.status === 'fulfilled' && result.value?.success) {
        stats.emailsSent++;
      } else {
        stats.emailsFailed++;
      }
    }
  }

  // 11. Log execution
  const status = stats.emailsFailed > 0 && stats.emailsSent > 0
    ? 'partial'
    : stats.emailsFailed > 0 && stats.emailsSent === 0 && emailTasks.length > 0
      ? 'partial'
      : 'success';

  await createExecutionLog(companyId, rule, startTime, stats, status, null);

  // 12. Update lastRunAt
  await NotificationRule.updateOne({ _id: rule._id }, { lastRunAt: new Date() });

  return stats;
};

/**
 * Create a RuleExecution log entry.
 */
const createExecutionLog = async (companyId, rule, startTime, stats, status, error) => {
  const now = new Date();
  try {
    await RuleExecution.create({
      company_id: companyId,
      rule_id: rule._id,
      ruleSlug: rule.slug,
      triggeredAt: new Date(startTime),
      completedAt: now,
      durationMs: now.getTime() - startTime,
      status,
      notificationsCreated: stats.notificationsCreated,
      emailsSent: stats.emailsSent,
      emailsFailed: stats.emailsFailed,
      error,
    });
  } catch (err) {
    console.error('[RuleEngine] Failed to create execution log:', err.message);
  }
};

module.exports = { executeRule, resolveRecipients };
