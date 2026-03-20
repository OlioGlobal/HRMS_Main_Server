const { format } = require('date-fns');
const Employee = require('../../../models/Employee');
const LeaveType = require('../../../models/LeaveType');
const { generateActionToken } = require('../../../utils/token');
const { fullName } = require('./helpers');

const slug = 'leave-notification';

/**
 * Event-triggered leave notifications.
 * contextData: { eventName, companyId, leaveRequest, employee }
 */
const findRecipients = async (companyId, contextData, config) => {
  try {
    const { eventName, leaveRequest, employee } = contextData || {};
    if (!leaveRequest || !employee) return [];

    const employeeName = fullName(employee);

    // Resolve leave type name
    let leaveType = 'Leave';
    if (leaveRequest.leaveType_id) {
      const lt = await LeaveType.findById(leaveRequest.leaveType_id).select('name').lean();
      leaveType = lt?.name || 'Leave';
    }
    const startDate = format(new Date(leaveRequest.startDate), 'dd MMM yyyy');
    const endDate = format(new Date(leaveRequest.endDate), 'dd MMM yyyy');

    const variables = {
      employeeName,
      leaveType,
      startDate,
      endDate,
      totalDays: leaveRequest.totalDays,
      reason: leaveRequest.reason || '',
      status: leaveRequest.status,
    };

    const recipients = [];

    switch (eventName) {
      case 'leave.applied': {
        // Notify manager with approve/reject action links
        if (employee.reportingManager_id) {
          const manager = await Employee.findById(employee.reportingManager_id)
            .select('user_id firstName lastName')
            .lean();

          if (manager?.user_id) {
            const baseUrl = process.env.CLIENT_URL?.replace(':3000', ':5000') || 'http://localhost:5000';

            const approveToken = generateActionToken({
              requestId: leaveRequest._id.toString(),
              companyId,
              reviewerId: manager.user_id.toString(),
              action: 'approve',
            });
            const rejectToken = generateActionToken({
              requestId: leaveRequest._id.toString(),
              companyId,
              reviewerId: manager.user_id.toString(),
              action: 'reject',
            });

            const approveUrl = `${baseUrl}/api/email-actions/leave/approve?token=${approveToken}`;
            const rejectUrl = `${baseUrl}/api/email-actions/leave/reject?token=${rejectToken}`;

            recipients.push({
              userId: manager.user_id.toString(),
              recipientType: 'manager',
              variables: { ...variables, approveUrl, rejectUrl },
              actionUrl: '/dashboard/leave/approvals',
            });
          }
        }
        break;
      }

      case 'leave.approved': {
        // Notify employee
        if (employee.user_id) {
          recipients.push({
            userId: employee.user_id.toString(),
            recipientType: 'employee',
            variables: { ...variables, status: 'approved' },
            actionUrl: '/dashboard/leave/my-leaves',
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
              actionUrl: '/dashboard/leave/approvals',
            });
          }
        }
        break;
      }

      case 'leave.rejected': {
        // Notify employee
        if (employee.user_id) {
          recipients.push({
            userId: employee.user_id.toString(),
            recipientType: 'employee',
            variables: { ...variables, status: 'rejected', rejectionReason: leaveRequest.reviewNote || '' },
            actionUrl: '/dashboard/leave/my-leaves',
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
              actionUrl: '/dashboard/leave/approvals',
            });
          }
        }
        break;
      }

      case 'leave.cancelled': {
        // Notify manager
        if (employee.reportingManager_id) {
          const manager = await Employee.findById(employee.reportingManager_id)
            .select('user_id firstName lastName')
            .lean();

          if (manager?.user_id) {
            recipients.push({
              userId: manager.user_id.toString(),
              recipientType: 'manager',
              variables,
              actionUrl: '/dashboard/leave/approvals',
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
