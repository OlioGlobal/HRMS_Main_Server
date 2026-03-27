const NotificationRule = require('../models/NotificationRule');

// ── HTML email wrapper ─────────────────────────────────────────────────────────
const wrapEmail = (bodyContent) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { margin: 0; padding: 0; background: #f4f5f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; margin-top: 24px; margin-bottom: 24px; }
    .header { background: #18181b; padding: 24px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 20px; font-weight: 600; }
    .body { padding: 32px 24px; color: #27272a; line-height: 1.6; }
    .body h2 { margin: 0 0 16px 0; font-size: 18px; color: #18181b; }
    .body p { margin: 0 0 12px 0; font-size: 14px; }
    .highlight { background: #f4f4f5; border-left: 4px solid #18181b; padding: 12px 16px; margin: 16px 0; border-radius: 0 4px 4px 0; }
    .footer { padding: 16px 24px; text-align: center; font-size: 12px; color: #a1a1aa; border-top: 1px solid #e4e4e7; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>{{companyName}}</h1></div>
    <div class="body">${bodyContent}</div>
    <div class="footer">This is an automated notification. Please do not reply to this email.</div>
  </div>
</body>
</html>`.trim();

// ── Default notification rules ─────────────────────────────────────────────────
const DEFAULT_RULES = [
  // 1. Probation Reminder
  {
    slug: 'probation-reminder',
    name: 'Probation Reminder',
    description: 'Reminds employees, managers, and HR when an employee\'s probation period is ending soon.',
    triggerType: 'cron',
    cronSchedule: '0 9 * * *',
    isEnabled: true,
    isSystem: true,
    config: { daysBefore: 7, daysAfter: null, runTime: '09:00' },
    recipients: { employee: true, manager: true, hr: true },
    channels: { inApp: true, email: true },
    templates: {
      inApp: {
        title: 'Probation Ending Soon',
        body: '{{employeeName}}\'s probation ends on {{probationEndDate}}.',
      },
      email: {
        subject: 'Probation Ending Soon - {{employeeName}}',
        body: wrapEmail(
          '<h2>Probation Reminder</h2>' +
          '<p>This is to inform you that <strong>{{employeeName}}</strong>\'s probation period is ending soon.</p>' +
          '<div class="highlight"><p><strong>Employee:</strong> {{employeeName}}<br/>' +
          '<strong>Probation End Date:</strong> {{probationEndDate}}</p></div>' +
          '<p>Please take the necessary steps to review their performance and confirm their status before the end date.</p>'
        ),
      },
    },
  },

  // 2. Birthday Wishes
  {
    slug: 'birthday-wishes',
    name: 'Birthday Wishes',
    description: 'Sends birthday wishes to employees on their special day.',
    triggerType: 'cron',
    cronSchedule: '0 9 * * *',
    isEnabled: false,
    isSystem: true,
    config: { daysBefore: null, daysAfter: null, runTime: '09:00' },
    recipients: { employee: true, manager: true, hr: false },
    channels: { inApp: true, email: false },
    templates: {
      inApp: {
        title: 'Happy Birthday! \uD83C\uDF89',
        body: 'Happy Birthday {{employeeName}}! \uD83C\uDF89 Wishing you a wonderful day!',
      },
      email: {
        subject: 'Happy Birthday {{employeeName}}!',
        body: wrapEmail(
          '<h2>Happy Birthday! \uD83C\uDF89</h2>' +
          '<p>Happy Birthday <strong>{{employeeName}}</strong>!</p>' +
          '<p>Wishing you a wonderful day filled with joy and happiness.</p>'
        ),
      },
    },
  },

  // 3. Leave Notification
  {
    slug: 'leave-notification',
    name: 'Leave Notification',
    description: 'Notifies employees and managers about leave applications, approvals, rejections, and cancellations.',
    triggerType: 'event',
    eventName: 'leave.applied,leave.approved,leave.rejected,leave.cancelled',
    isEnabled: true,
    isSystem: true,
    config: { daysBefore: null, daysAfter: null, runTime: null },
    recipients: { employee: true, manager: true, hr: false },
    channels: { inApp: true, email: false },
    templates: {
      inApp: {
        title: 'Leave {{status}}',
        body: '{{employeeName}} applied for {{leaveType}} ({{startDate}} - {{endDate}}). Status: {{status}}.',
      },
      email: {
        subject: 'Leave {{status}} - {{employeeName}}',
        body: wrapEmail(
          '<h2>Leave {{status}}</h2>' +
          '<p>{{employeeName}} has a leave update.</p>' +
          '<div class="highlight"><p><strong>Employee:</strong> {{employeeName}}<br/>' +
          '<strong>Leave Type:</strong> {{leaveType}}<br/>' +
          '<strong>Period:</strong> {{startDate}} - {{endDate}}<br/>' +
          '<strong>Reason:</strong> {{reason}}<br/>' +
          '<strong>Status:</strong> {{status}}</p></div>' +
          '{{#if approveUrl}}' +
          '<div style="margin-top:24px;text-align:center">' +
          '<a href="{{approveUrl}}" style="display:inline-block;padding:12px 32px;background:#16a34a;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;margin-right:12px">✅ Approve</a>' +
          '<a href="{{rejectUrl}}" style="display:inline-block;padding:12px 32px;background:#dc2626;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">❌ Reject</a>' +
          '</div>' +
          '<p style="margin-top:12px;font-size:12px;color:#a1a1aa;text-align:center">These links expire in 72 hours.</p>' +
          '{{/if}}'
        ),
      },
    },
  },

  // 4. Missed Clock-Out
  {
    slug: 'missed-clock-out',
    name: 'Missed Clock-Out',
    description: 'Reminds employees who forgot to clock out at the end of the day.',
    triggerType: 'cron',
    cronSchedule: '0 21 * * *',
    isEnabled: true,
    isSystem: true,
    config: { daysBefore: null, daysAfter: null, runTime: '21:00' },
    recipients: { employee: true, manager: false, hr: false },
    channels: { inApp: true, email: false },
    templates: {
      inApp: {
        title: 'Missed Clock-Out',
        body: 'You forgot to clock out today. Please submit a regularization request.',
      },
      email: {
        subject: 'Missed Clock-Out Reminder',
        body: wrapEmail(
          '<h2>Missed Clock-Out</h2>' +
          '<p>It looks like you forgot to clock out today.</p>' +
          '<p>Please submit a regularization request to correct your attendance record.</p>'
        ),
      },
    },
  },

  // 5. Document Expiry Alert
  {
    slug: 'document-expiry-alert',
    name: 'Document Expiry Alert',
    description: 'Alerts employees and HR when documents are nearing their expiry date.',
    triggerType: 'cron',
    cronSchedule: '0 9 * * *',
    isEnabled: true,
    isSystem: true,
    config: { daysBefore: 30, daysAfter: null, runTime: '09:00' },
    recipients: { employee: true, manager: false, hr: true },
    channels: { inApp: true, email: true },
    templates: {
      inApp: {
        title: 'Document Expiring Soon',
        body: '{{documentName}} for {{employeeName}} expires on {{expiryDate}}.',
      },
      email: {
        subject: 'Document Expiry Alert - {{documentName}}',
        body: wrapEmail(
          '<h2>Document Expiry Alert</h2>' +
          '<p>The following document is expiring soon and needs attention.</p>' +
          '<div class="highlight"><p><strong>Document:</strong> {{documentName}}<br/>' +
          '<strong>Employee:</strong> {{employeeName}}<br/>' +
          '<strong>Expiry Date:</strong> {{expiryDate}}</p></div>' +
          '<p>Please ensure the document is renewed or updated before the expiry date.</p>'
        ),
      },
    },
  },

  // 6. Payslip Ready
  {
    slug: 'payslip-ready',
    name: 'Payslip Ready',
    description: 'Notifies employees when their payslip for the month is ready.',
    triggerType: 'event',
    eventName: 'payroll.paid',
    isEnabled: true,
    isSystem: true,
    config: { daysBefore: null, daysAfter: null, runTime: null },
    recipients: { employee: true, manager: false, hr: false },
    channels: { inApp: true, email: false },
    templates: {
      inApp: {
        title: 'Payslip Ready',
        body: 'Your payslip for {{month}} {{year}} is ready. You can view and download it from your payroll section.',
      },
      email: {
        subject: 'Your Payslip for {{month}} {{year}} is Ready',
        body: wrapEmail(
          '<h2>Payslip Ready</h2>' +
          '<p>Your payslip for <strong>{{month}} {{year}}</strong> is now available.</p>' +
          '<p>You can view and download it from your payroll section in the portal.</p>'
        ),
      },
    },
  },

  // 7. Appraisal Reminder
  {
    slug: 'appraisal-reminder',
    name: 'Appraisal Reminder',
    description: 'Reminds employees and managers about upcoming appraisal deadlines.',
    triggerType: 'cron',
    cronSchedule: '0 9 * * *',
    isEnabled: true,
    isSystem: true,
    config: { daysBefore: 3, daysAfter: null, runTime: '09:00' },
    recipients: { employee: true, manager: true, hr: false },
    channels: { inApp: true, email: false },
    templates: {
      inApp: {
        title: 'Appraisal Deadline Approaching',
        body: 'Appraisal deadline in {{daysLeft}} days for {{cycleName}}. Please complete your review.',
      },
      email: {
        subject: 'Appraisal Deadline in {{daysLeft}} Days - {{cycleName}}',
        body: wrapEmail(
          '<h2>Appraisal Deadline Approaching</h2>' +
          '<p>The appraisal deadline for <strong>{{cycleName}}</strong> is in <strong>{{daysLeft}} days</strong>.</p>' +
          '<p>Please ensure you have completed your review before the deadline.</p>'
        ),
      },
    },
  },

  // 8. Onboarding Incomplete
  {
    slug: 'onboarding-incomplete',
    name: 'Onboarding Incomplete',
    description: 'Alerts when an employee\'s onboarding is still incomplete after a configured number of days.',
    triggerType: 'cron',
    cronSchedule: '0 9 * * *',
    isEnabled: true,
    isSystem: true,
    config: { daysBefore: null, daysAfter: 14, runTime: '09:00', repeatIntervalDays: 7, maxNotifications: 3 },
    recipients: { employee: true, manager: false, hr: true },
    channels: { inApp: true, email: true },
    templates: {
      inApp: {
        title: 'Onboarding Incomplete',
        body: '{{employeeName}}\'s onboarding is incomplete ({{progress}}%). Please complete the remaining steps.',
      },
      email: {
        subject: 'Onboarding Incomplete - {{employeeName}}',
        body: wrapEmail(
          '<h2>Onboarding Incomplete</h2>' +
          '<p><strong>{{employeeName}}</strong>\'s onboarding process is still incomplete after joining.</p>' +
          '<div class="highlight"><p><strong>Employee:</strong> {{employeeName}}<br/>' +
          '<strong>Progress:</strong> {{progress}}%</p></div>' +
          '<p>Please follow up and ensure all onboarding steps are completed as soon as possible.</p>'
        ),
      },
    },
  },

  // 9. Offboarding Approaching
  {
    slug: 'offboarding-approaching',
    name: 'Offboarding Approaching',
    description: 'Notifies when an employee\'s last working day is approaching.',
    triggerType: 'cron',
    cronSchedule: '0 9 * * *',
    isEnabled: true,
    isSystem: true,
    config: { daysBefore: 7, daysAfter: null, runTime: '09:00', repeatIntervalDays: 3, maxNotifications: 5 },
    recipients: { employee: true, manager: true, hr: true },
    channels: { inApp: true, email: true },
    templates: {
      inApp: {
        title: 'Last Working Day Approaching',
        body: '{{employeeName}}\'s last working day is {{lastWorkingDay}} ({{daysLeft}} days left).',
      },
      email: {
        subject: 'Offboarding - {{employeeName}}\'s Last Working Day Approaching',
        body: wrapEmail(
          '<h2>Offboarding Approaching</h2>' +
          '<p><strong>{{employeeName}}</strong>\'s last working day is approaching.</p>' +
          '<div class="highlight"><p><strong>Employee:</strong> {{employeeName}}<br/>' +
          '<strong>Last Working Day:</strong> {{lastWorkingDay}}<br/>' +
          '<strong>Days Left:</strong> {{daysLeft}}</p></div>' +
          '<p>Please ensure all offboarding tasks (knowledge transfer, asset return, exit interview, access revocation) are completed before the last working day.</p>'
        ),
      },
    },
  },

  // 10. Work Anniversary
  {
    slug: 'work-anniversary',
    name: 'Work Anniversary',
    description: 'Celebrates employee work anniversaries.',
    triggerType: 'cron',
    cronSchedule: '0 9 * * *',
    isEnabled: false,
    isSystem: true,
    config: { daysBefore: null, daysAfter: null, runTime: '09:00' },
    recipients: { employee: true, manager: true, hr: false },
    channels: { inApp: true, email: false },
    templates: {
      inApp: {
        title: 'Happy Work Anniversary! \uD83C\uDF89',
        body: 'Happy {{years}} year work anniversary {{employeeName}}! Thank you for your dedication and contributions.',
      },
      email: {
        subject: 'Happy {{years}} Year Work Anniversary {{employeeName}}!',
        body: wrapEmail(
          '<h2>Happy Work Anniversary! \uD83C\uDF89</h2>' +
          '<p>Congratulations <strong>{{employeeName}}</strong> on completing <strong>{{years}} year(s)</strong> with us!</p>' +
          '<p>Thank you for your dedication, hard work, and contributions to the team. Here\'s to many more years together!</p>'
        ),
      },
    },
  },

  // 11. Holiday Reminder
  {
    slug: 'holiday-reminder',
    name: 'Holiday Reminder',
    description: 'Reminds employees about upcoming public holidays.',
    triggerType: 'cron',
    cronSchedule: '0 9 * * *',
    isEnabled: true,
    isSystem: true,
    config: { daysBefore: 2, daysAfter: null, runTime: '09:00' },
    recipients: { employee: true, manager: false, hr: false },
    channels: { inApp: true, email: false },
    templates: {
      inApp: {
        title: 'Upcoming Holiday: {{holidayName}}',
        body: '{{holidayName}} is on {{holidayDate}} ({{daysLeft}} day(s) from now). {{locationNote}}',
      },
      email: {
        subject: 'Upcoming Holiday: {{holidayName}} on {{holidayDate}}',
        body: wrapEmail(
          '<h2>Upcoming Holiday</h2>' +
          '<p><strong>{{holidayName}}</strong> is on <strong>{{holidayDate}}</strong>.</p>' +
          '<p>{{locationNote}}</p>' +
          '<p>Enjoy your day off!</p>'
        ),
      },
    },
  },

  // 12. Leave Auto-Approve
  {
    slug: 'leave-auto-approve',
    name: 'Leave Auto-Approve',
    description: 'Auto-approves pending leave requests after the configured number of days per leave type.',
    triggerType: 'cron',
    cronSchedule: '0 9 * * *',
    isEnabled: true,
    isSystem: true,
    config: { daysBefore: null, daysAfter: null, runTime: '09:00' },
    recipients: { employee: true, manager: false, hr: false },
    channels: { inApp: true, email: false },
    templates: {
      inApp: {
        title: 'Leave Auto-Approved',
        body: 'Your {{leaveType}} ({{startDate}} - {{endDate}}) has been auto-approved after {{autoApproveDays}} day(s).',
      },
      email: {
        subject: 'Leave Auto-Approved - {{leaveType}}',
        body: wrapEmail(
          '<h2>Leave Auto-Approved</h2>' +
          '<p>Your <strong>{{leaveType}}</strong> request has been automatically approved.</p>' +
          '<div class="highlight"><p><strong>Period:</strong> {{startDate}} - {{endDate}}<br/>' +
          '<strong>Reason:</strong> No action taken within {{autoApproveDays}} day(s).</p></div>'
        ),
      },
    },
  },

  // 13. Shift Notification
  {
    slug: 'shift-notification',
    name: 'Shift Notification',
    description: 'Notifies employees about shift start, shift end, and when they complete their required working hours.',
    triggerType: 'cron',
    cronSchedule: '*/15 * * * *',
    isEnabled: true,
    isSystem: true,
    config: { daysBefore: null, daysAfter: null, runTime: null, reminderMinutes: 15 },
    recipients: { employee: true, manager: false, hr: false },
    channels: { inApp: true, email: false },
    templates: {
      inApp: {
        title: '{{shiftTitle}}',
        body: '{{shiftMessage}}',
      },
      email: {
        subject: '{{shiftTitle}} - {{employeeName}}',
        body: wrapEmail(
          '<h2>{{shiftTitle}}</h2>' +
          '<p>Hi <strong>{{employeeName}}</strong>,</p>' +
          '<p>{{shiftMessage}}</p>'
        ),
      },
    },
  },

  // 14. WFH Notification
  {
    slug: 'wfh-notification',
    name: 'WFH Request Notification',
    description: 'Notifies employees and managers about WFH request submissions, approvals, and rejections.',
    triggerType: 'event',
    eventName: 'wfh.requested,wfh.approved,wfh.rejected',
    isEnabled: true,
    isSystem: true,
    config: { daysBefore: null, daysAfter: null, runTime: null },
    recipients: { employee: true, manager: true, hr: false },
    channels: { inApp: true, email: false },
    templates: {
      inApp: {
        title: 'WFH Request {{status}}',
        body: '{{employeeName}} requested WFH for {{date}}. Status: {{status}}.',
      },
      email: {
        subject: 'WFH Request {{status}} - {{employeeName}}',
        body: wrapEmail(
          '<h2>WFH Request {{status}}</h2>' +
          '<p>{{employeeName}} has a WFH request update.</p>' +
          '<div class="highlight"><p><strong>Employee:</strong> {{employeeName}}<br/>' +
          '<strong>Date:</strong> {{date}}<br/>' +
          '<strong>Reason:</strong> {{reason}}<br/>' +
          '<strong>Status:</strong> {{status}}</p></div>' +
          '{{#if approveUrl}}' +
          '<div style="margin-top:24px;text-align:center">' +
          '<a href="{{approveUrl}}" style="display:inline-block;padding:12px 32px;background:#16a34a;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;margin-right:12px">Approve</a>' +
          '<a href="{{rejectUrl}}" style="display:inline-block;padding:12px 32px;background:#dc2626;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Reject</a>' +
          '</div>' +
          '<p style="margin-top:12px;font-size:12px;color:#a1a1aa;text-align:center">These links expire in 72 hours.</p>' +
          '{{/if}}'
        ),
      },
    },
  },
  {
    slug: 'reimbursement-notification',
    name: 'Reimbursement Notification',
    description: 'Notifies about reimbursement submissions, approvals, rejections, and payments.',
    triggerType: 'event',
    eventName: 'reimbursement.submitted,reimbursement.manager_approved,reimbursement.hr_approved,reimbursement.paid,reimbursement.rejected',
    isEnabled: true,
    isSystem: true,
    config: { daysBefore: null, daysAfter: null, runTime: null },
    recipients: { employee: true, manager: true, hr: true },
    channels: { inApp: true, email: true },
    templates: {
      inApp: {
        title: 'Reimbursement {{status}}',
        body: '{{employeeName}}: {{description}} — ₹{{amount}}. Status: {{status}}.',
      },
      email: {
        subject: 'Reimbursement {{status}} — {{employeeName}}',
        body: wrapEmail(
          '<h2>Reimbursement {{status}}</h2>' +
          '<p>Hi <strong>{{recipientName}}</strong>,</p>' +
          '<p>A reimbursement claim has been updated.</p>' +
          '<div class="highlight"><p><strong>Employee:</strong> {{employeeName}}<br/>' +
          '<strong>Category:</strong> {{category}}<br/>' +
          '<strong>Amount:</strong> ₹{{amount}}<br/>' +
          '<strong>Description:</strong> {{description}}<br/>' +
          '<strong>Status:</strong> {{status}}</p></div>' +
          '{{#if hasReceipt}}' +
          '<div style="margin-top:16px;text-align:center">' +
          '<a href="{{viewReceiptUrl}}" style="display:inline-block;padding:10px 24px;background:#3b82f6;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:13px">View Receipt</a>' +
          '</div>' +
          '{{/if}}' +
          '{{#if approveUrl}}' +
          '<div style="margin-top:16px;text-align:center">' +
          '<a href="{{approveUrl}}" style="display:inline-block;padding:12px 32px;background:#16a34a;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;margin-right:12px">Approve</a>' +
          '<a href="{{rejectUrl}}" style="display:inline-block;padding:12px 32px;background:#dc2626;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Reject</a>' +
          '</div>' +
          '<p style="margin-top:12px;font-size:12px;color:#a1a1aa;text-align:center">These links expire in 72 hours.</p>' +
          '{{/if}}'
        ),
      },
    },
  },
];

/**
 * Seed default notification rules for a company.
 * Idempotent — duplicates are silently skipped via unique index on { company_id, slug }.
 */
const seedDefaultNotificationRules = async (companyId) => {
  // Quick check: if any rules already exist for this company, skip entirely
  const existingCount = await NotificationRule.countDocuments({ company_id: companyId });
  if (existingCount > 0) return;

  const docs = DEFAULT_RULES.map((rule) => ({
    company_id: companyId,
    ...rule,
  }));

  try {
    const result = await NotificationRule.insertMany(docs, { ordered: false, rawResult: true });
    const inserted = result.insertedCount ?? 0;
    if (inserted > 0) {
      console.log(`[NotificationRules] ${inserted} default rules seeded for company ${companyId}.`);
    }
  } catch (err) {
    // 11000 = duplicate key — expected on re-runs / race conditions
    if (err.code === 11000 || err.name === 'MongoBulkWriteError') {
      const inserted = err.insertedDocs?.length ?? 0;
      if (inserted > 0) {
        console.log(`[NotificationRules] ${inserted} default rules seeded for company ${companyId} (some duplicates skipped).`);
      }
    } else {
      throw err;
    }
  }
};

module.exports = { seedDefaultNotificationRules, DEFAULT_RULES };
