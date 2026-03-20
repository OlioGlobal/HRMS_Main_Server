const { differenceInDays, format } = require('date-fns');
const LeaveRequest = require('../../../models/LeaveRequest');
const LeaveType = require('../../../models/LeaveType');
const LeaveBalance = require('../../../models/LeaveBalance');
const Employee = require('../../../models/Employee');
const eventBus = require('../../../utils/eventBus');
const { fullName } = require('./helpers');

const slug = 'leave-auto-approve';

/**
 * Auto-approve leave requests that have been pending for X days.
 * Uses the autoApproveDays setting from LeaveType, not from the rule config.
 */
const findRecipients = async (companyId, contextData, config) => {
  try {
    const today = new Date();
    const recipients = [];

    // Find leave types with autoApproveDays set
    const leaveTypes = await LeaveType.find({
      company_id: companyId,
      autoApproveDays: { $ne: null, $gt: 0 },
      isActive: true,
    }).lean();

    if (!leaveTypes.length) return [];

    for (const lt of leaveTypes) {
      // Find pending requests for this leave type older than autoApproveDays
      const cutoffDate = new Date(today);
      cutoffDate.setDate(cutoffDate.getDate() - lt.autoApproveDays);

      const pendingRequests = await LeaveRequest.find({
        company_id: companyId,
        leaveType_id: lt._id,
        status: 'pending',
        createdAt: { $lte: cutoffDate },
      }).lean();

      for (const request of pendingRequests) {
        // Auto-approve
        await LeaveRequest.updateOne(
          { _id: request._id },
          { status: 'approved', reviewedAt: new Date(), reviewNote: `Auto-approved after ${lt.autoApproveDays} day(s)` }
        );

        // Update balance
        if (!request.isLWP) {
          const balance = await LeaveBalance.findOne({
            company_id: companyId,
            employee_id: request.employee_id,
            leaveType_id: request.leaveType_id,
            year: request.startDate.getFullYear(),
          });
          if (balance) {
            balance.pending = Math.max(0, balance.pending - request.totalDays);
            balance.used += request.totalDays;
            await balance.save();
          }
        }

        // Get employee for notification
        const employee = await Employee.findById(request.employee_id)
          .select('_id user_id firstName lastName employeeId reportingManager_id')
          .lean();

        if (!employee) continue;

        // Emit approved event (triggers leave-notification rule for employee + manager)
        eventBus.emit('leave.approved', {
          companyId,
          leaveRequest: { ...request, status: 'approved' },
          employee,
        });

        // Also add to recipients for this rule's own notification
        if (employee.user_id) {
          recipients.push({
            userId: employee.user_id.toString(),
            recipientType: 'employee',
            variables: {
              employeeName: fullName(employee),
              leaveType: lt.name,
              startDate: format(new Date(request.startDate), 'dd MMM yyyy'),
              endDate: format(new Date(request.endDate), 'dd MMM yyyy'),
              autoApproveDays: lt.autoApproveDays,
            },
            actionUrl: '/dashboard/leave/my-leaves',
          });
        }
      }
    }

    return recipients;
  } catch (err) {
    console.error(`[RuleEngine] ${slug} handler error:`, err.message);
    return [];
  }
};

module.exports = { slug, findRecipients };
