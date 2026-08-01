const NotificationRule = require('../models/NotificationRule');
const { buildEmail } = require('../utils/emailTemplates');

// ── Shared CTA blocks (Handlebars conditionals compiled at send time) ──────────
const approveRejectBlock =
  '{{#if approveUrl}}' +
  '<div class="btns">' +
  '<a class="btn" href="{{approveUrl}}" style="background:#16a34a;color:#ffffff;">Approve</a>' +
  '<a class="btn" href="{{rejectUrl}}" style="background:#dc2626;color:#ffffff;">Reject</a>' +
  '</div>' +
  '<p class="note" style="text-align:center;">These action links expire in 72 hours.</p>' +
  '{{/if}}';

const receiptBlock =
  '{{#if hasReceipt}}' +
  '<div class="btns"><a class="btn" href="{{viewReceiptUrl}}" style="background:#3f3f46;color:#ffffff;">View Receipt</a></div>' +
  '{{/if}}';

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
        subject: 'Probation ending soon — {{employeeName}}',
        body: buildEmail({
          accent: '#f59e0b', icon: '⏳', iconBg: '#fef3c7',
          title: 'Probation Ending Soon',
          greeting: 'Hi {{recipientName}},',
          intro: '<strong>{{employeeName}}</strong>\'s probation period is ending soon. Please review their performance and confirm their status before the end date.',
          rows: [['Employee', '{{employeeName}}'], ['Probation Ends', '{{probationEndDate}}']],
        }),
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
    config: { daysBefore: null, daysAfter: null, runTime: '09:00', consolidateEmail: true },
    recipients: { employee: true, manager: true, hr: false },
    channels: { inApp: true, email: false },
    templates: {
      inApp: {
        title: 'Happy Birthday! 🎉',
        body: 'Happy Birthday {{employeeName}}! 🎉 Wishing you a wonderful day!',
      },
      email: {
        subject: 'Happy Birthday, {{employeeName}}! 🎉',
        body: buildEmail({
          accent: '#ec4899', icon: '🎂', iconBg: '#fce7f3',
          title: 'Happy Birthday, {{employeeName}}! 🎉',
          intro: 'Today we\'re celebrating <strong>{{employeeName}}</strong>. Join us in wishing them a wonderful day filled with joy, laughter, and success! 🎂',
          rows: [['Employee', '{{employeeName}}'], ['Team', '{{department}}']],
          note: 'Sent with warm wishes from everyone at {{companyName}}.',
        }),
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
        body: '{{employeeName}} applied for {{leaveType}} ({{startDate}} - {{endDate}}, {{duration}}). Status: {{status}}.',
      },
      email: {
        subject: 'Leave {{status}} — {{employeeName}} ({{duration}})',
        body: buildEmail({
          accent: '#6366f1', icon: '🌴', iconBg: '#eef2ff',
          title: 'Leave {{status}}',
          greeting: 'Hi {{recipientName}},',
          intro: 'There\'s an update on <strong>{{employeeName}}</strong>\'s leave request.',
          rows: [
            ['Employee', '{{employeeName}}'],
            ['Leave Type', '{{leaveType}}'],
            ['Period', '{{startDate}} &rarr; {{endDate}}'],
            ['Duration', '{{duration}}'],
            ['Reason', '{{reason}}'],
            ['Status', '{{status}}'],
          ],
          extraHtml: approveRejectBlock,
        }),
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
        subject: 'You missed a clock-out today',
        body: buildEmail({
          accent: '#ef4444', icon: '⏰', iconBg: '#fee2e2',
          title: 'You Missed a Clock-Out',
          intro: 'It looks like you forgot to clock out today. Please submit a regularization request so your attendance record stays accurate.',
          note: 'You can raise a regularization from Attendance &rarr; My Attendance in the portal.',
        }),
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
        subject: 'Document expiring soon — {{documentName}}',
        body: buildEmail({
          accent: '#f59e0b', icon: '📄', iconBg: '#fef3c7',
          title: 'Document Expiring Soon',
          greeting: 'Hi {{recipientName}},',
          intro: 'A document is approaching its expiry date and needs attention before it lapses.',
          rows: [
            ['Document', '{{documentName}}'],
            ['Employee', '{{employeeName}}'],
            ['Expiry Date', '{{expiryDate}}'],
          ],
        }),
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
        subject: 'Your payslip for {{month}} {{year}} is ready',
        body: buildEmail({
          accent: '#16a34a', icon: '💰', iconBg: '#dcfce7',
          title: 'Your Payslip is Ready',
          intro: 'Your payslip for <strong>{{month}} {{year}}</strong> is now available. You can view and download it anytime from your payroll section.',
          rows: [['Pay Period', '{{month}} {{year}}']],
        }),
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
        subject: 'Appraisal deadline in {{daysLeft}} days — {{cycleName}}',
        body: buildEmail({
          accent: '#6366f1', icon: '📊', iconBg: '#eef2ff',
          title: 'Appraisal Deadline Approaching',
          greeting: 'Hi {{recipientName}},',
          intro: 'The appraisal window for <strong>{{cycleName}}</strong> closes in <strong>{{daysLeft}} day(s)</strong>. Please complete your review in time.',
          rows: [['Cycle', '{{cycleName}}'], ['Days Left', '{{daysLeft}}']],
        }),
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
        subject: 'Onboarding incomplete — {{employeeName}}',
        body: buildEmail({
          accent: '#0ea5e9', icon: '🚀', iconBg: '#e0f2fe',
          title: 'Onboarding Still Incomplete',
          greeting: 'Hi {{recipientName}},',
          intro: '<strong>{{employeeName}}</strong>\'s onboarding is only {{progress}}% complete. Please help wrap up the remaining steps as soon as possible.',
          rows: [['Employee', '{{employeeName}}'], ['Progress', '{{progress}}%']],
        }),
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
        subject: 'Offboarding — {{employeeName}}\'s last working day approaching',
        body: buildEmail({
          accent: '#f59e0b', icon: '👋', iconBg: '#fef3c7',
          title: 'Last Working Day Approaching',
          greeting: 'Hi {{recipientName}},',
          intro: '<strong>{{employeeName}}</strong>\'s last working day is coming up. Please ensure all offboarding tasks are completed in time.',
          rows: [
            ['Employee', '{{employeeName}}'],
            ['Last Working Day', '{{lastWorkingDay}}'],
            ['Days Left', '{{daysLeft}}'],
          ],
          note: 'Checklist: knowledge transfer, asset return, exit interview, and access revocation.',
        }),
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
    config: { daysBefore: null, daysAfter: null, runTime: '09:00', consolidateEmail: true },
    recipients: { employee: true, manager: true, hr: false },
    channels: { inApp: true, email: false },
    templates: {
      inApp: {
        title: 'Happy Work Anniversary! 🎉',
        body: 'Happy {{years}} year work anniversary {{employeeName}}! Thank you for your dedication and contributions.',
      },
      email: {
        subject: 'Happy {{years}}-year work anniversary, {{employeeName}}! 🎉',
        body: buildEmail({
          accent: '#8b5cf6', icon: '🎉', iconBg: '#ede9fe',
          title: 'Happy Work Anniversary, {{employeeName}}!',
          intro: 'Congratulations to <strong>{{employeeName}}</strong> on completing <strong>{{years}} year(s)</strong> with us! Thank you for the dedication, energy, and impact. Here\'s to many more! 🥳',
          rows: [['Employee', '{{employeeName}}'], ['Years', '{{years}}'], ['Joined', '{{joiningDate}}']],
          note: 'Celebrated by everyone at {{companyName}}.',
        }),
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
    config: { daysBefore: 2, daysAfter: null, runTime: '09:00', consolidateEmail: true },
    recipients: { employee: true, manager: false, hr: false },
    channels: { inApp: true, email: false },
    templates: {
      inApp: {
        title: 'Upcoming Holiday: {{holidayName}}',
        body: '{{holidayName}} is on {{holidayDate}} ({{daysLeft}} day(s) from now). {{locationNote}}',
      },
      email: {
        subject: 'Upcoming holiday: {{holidayName}} on {{holidayDate}}',
        body: buildEmail({
          accent: '#0ea5e9', icon: '🏖️', iconBg: '#e0f2fe',
          title: 'Upcoming Holiday',
          intro: 'A quick heads-up — <strong>{{holidayName}}</strong> is coming up in {{daysLeft}} day(s). {{locationNote}}',
          rows: [
            ['Holiday', '{{holidayName}}'],
            ['Date', '{{holidayDate}}'],
            ['Applies To', '{{locationName}}'],
          ],
          note: 'Enjoy your day off! 🌴',
        }),
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
        body: 'Your {{leaveType}} ({{startDate}} - {{endDate}}, {{duration}}) has been auto-approved after {{autoApproveDays}} day(s).',
      },
      email: {
        subject: 'Leave auto-approved — {{leaveType}} ({{duration}})',
        body: buildEmail({
          accent: '#16a34a', icon: '✅', iconBg: '#dcfce7',
          title: 'Leave Auto-Approved',
          intro: 'Your <strong>{{leaveType}}</strong> request was automatically approved after {{autoApproveDays}} day(s) without action.',
          rows: [
            ['Leave Type', '{{leaveType}}'],
            ['Period', '{{startDate}} &rarr; {{endDate}}'],
            ['Duration', '{{duration}}'],
          ],
        }),
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
        subject: '{{shiftTitle}} — {{employeeName}}',
        body: buildEmail({
          accent: '#6366f1', icon: '⏱️', iconBg: '#eef2ff',
          title: '{{shiftTitle}}',
          greeting: 'Hi {{employeeName}},',
          intro: '{{shiftMessage}}',
          rows: [['Shift', '{{shiftStart}} &ndash; {{shiftEnd}}'], ['Required Hours', '{{requiredHours}}h']],
        }),
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
        subject: 'WFH request {{status}} — {{employeeName}}',
        body: buildEmail({
          accent: '#6366f1', icon: '🏠', iconBg: '#eef2ff',
          title: 'WFH Request {{status}}',
          greeting: 'Hi {{recipientName}},',
          intro: 'There\'s an update on <strong>{{employeeName}}</strong>\'s work-from-home request.',
          rows: [
            ['Employee', '{{employeeName}}'],
            ['Date', '{{date}}'],
            ['Reason', '{{reason}}'],
            ['Status', '{{status}}'],
          ],
          extraHtml: approveRejectBlock,
        }),
      },
    },
  },

  // 15. Reimbursement Notification
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
        body: buildEmail({
          accent: '#16a34a', icon: '🧾', iconBg: '#dcfce7',
          title: 'Reimbursement {{status}}',
          greeting: 'Hi {{recipientName}},',
          intro: 'A reimbursement claim has been updated.',
          rows: [
            ['Employee', '{{employeeName}}'],
            ['Category', '{{category}}'],
            ['Amount', '₹{{amount}}'],
            ['Description', '{{description}}'],
            ['Status', '{{status}}'],
          ],
          extraHtml: receiptBlock + approveRejectBlock,
        }),
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
