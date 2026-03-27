const { format } = require('date-fns');
const Employee = require('../../../models/Employee');
const { generateActionToken } = require('../../../utils/token');
const { fullName } = require('./helpers');

const slug = 'wfh-notification';

/**
 * Event-triggered WFH notifications.
 * contextData: { eventName, companyId, wfhRequest, employee }
 */
const findRecipients = async (companyId, contextData, config) => {
  try {
    const { eventName, wfhRequest, employee } = contextData || {};
    if (!wfhRequest || !employee) return [];

    const employeeName = fullName(employee);
    const start = format(new Date(wfhRequest.startDate || wfhRequest.date), 'dd MMM yyyy');
    const end = wfhRequest.endDate ? format(new Date(wfhRequest.endDate), 'dd MMM yyyy') : start;
    const dateDisplay = start === end ? start : `${start} - ${end}`;

    const variables = {
      employeeName,
      date: dateDisplay,
      startDate: start,
      endDate: end,
      reason: wfhRequest.reason || '',
      status: wfhRequest.status,
      totalDays: wfhRequest.totalDays || 1,
    };

    const recipients = [];

    switch (eventName) {
      case 'wfh.requested': {
        // Notify manager with approve/reject action links
        if (employee.reportingManager_id) {
          const manager = await Employee.findById(employee.reportingManager_id)
            .select('user_id firstName lastName')
            .lean();

          if (manager?.user_id) {
            const baseUrl = process.env.CLIENT_URL?.replace(':3000', ':5000') || 'http://localhost:5000';

            const approveToken = generateActionToken({
              requestId: wfhRequest._id.toString(),
              companyId,
              reviewerId: manager.user_id.toString(),
              action: 'approve',
            });
            const rejectToken = generateActionToken({
              requestId: wfhRequest._id.toString(),
              companyId,
              reviewerId: manager.user_id.toString(),
              action: 'reject',
            });

            const approveUrl = `${baseUrl}/api/email-actions/wfh/approve?token=${approveToken}`;
            const rejectUrl = `${baseUrl}/api/email-actions/wfh/reject?token=${rejectToken}`;

            recipients.push({
              userId: manager.user_id.toString(),
              recipientType: 'manager',
              variables: { ...variables, approveUrl, rejectUrl },
              actionUrl: '/dashboard/wfh-requests',
            });
          }
        }
        break;
      }

      case 'wfh.approved': {
        // Notify employee
        if (employee.user_id) {
          recipients.push({
            userId: employee.user_id.toString(),
            recipientType: 'employee',
            variables: { ...variables, status: 'approved' },
            actionUrl: '/dashboard/wfh-requests/my',
          });
        }
        // Keep manager in loop
        if (employee.reportingManager_id) {
          const manager = await Employee.findById(employee.reportingManager_id).select('user_id').lean();
          if (manager?.user_id) {
            recipients.push({
              userId: manager.user_id.toString(),
              recipientType: 'manager',
              variables: { ...variables, status: 'approved' },
              actionUrl: '/dashboard/wfh-requests',
            });
          }
        }
        break;
      }

      case 'wfh.rejected': {
        // Notify employee with reason
        if (employee.user_id) {
          recipients.push({
            userId: employee.user_id.toString(),
            recipientType: 'employee',
            variables: { ...variables, status: 'rejected', rejectedReason: wfhRequest.rejectedReason || '' },
            actionUrl: '/dashboard/wfh-requests/my',
          });
        }
        // Keep manager in loop
        if (employee.reportingManager_id) {
          const manager = await Employee.findById(employee.reportingManager_id).select('user_id').lean();
          if (manager?.user_id) {
            recipients.push({
              userId: manager.user_id.toString(),
              recipientType: 'manager',
              variables: { ...variables, status: 'rejected' },
              actionUrl: '/dashboard/wfh-requests',
            });
          }
        }
        break;
      }

      default:
        break;
    }

    return recipients;
  } catch (err) {
    console.error(`[RuleEngine] ${slug} handler error:`, err.message);
    return [];
  }
};

module.exports = { slug, findRecipients };
