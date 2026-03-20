/**
 * Rule Engine Handler Registry
 *
 * Maps notification rule slugs to their handler modules.
 * Each handler must export: { findRecipients(companyId, contextData, config) }
 * which returns an array of { userId, employeeId, employeeName, email, ...extra }
 */
const registry = {
  'probation-reminder':     require('./handlers/probationReminder'),
  'birthday-wishes':        require('./handlers/birthdayWishes'),
  'leave-notification':     require('./handlers/leaveNotification'),
  'missed-clock-out':       require('./handlers/missedClockOut'),
  'document-expiry-alert':  require('./handlers/documentExpiryAlert'),
  'payslip-ready':          require('./handlers/payslipReady'),
  'appraisal-reminder':     require('./handlers/appraisalReminder'),
  'onboarding-incomplete':  require('./handlers/onboardingIncomplete'),
  'offboarding-approaching': require('./handlers/offboardingApproaching'),
  'work-anniversary':       require('./handlers/workAnniversary'),
  'holiday-reminder':       require('./handlers/holidayReminder'),
  'leave-auto-approve':     require('./handlers/leaveAutoApprove'),
};

module.exports = registry;
