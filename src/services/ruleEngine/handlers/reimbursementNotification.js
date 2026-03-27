const { format } = require('date-fns');
const Employee = require('../../../models/Employee');
const { generateActionToken } = require('../../../utils/token');
const { fullName, findHRUsers } = require('./helpers');

const slug = 'reimbursement-notification';

/**
 * Event-triggered reimbursement notifications.
 * contextData: { eventName, companyId, reimbursement, employee }
 */
const findRecipients = async (companyId, contextData, config) => {
  try {
    const { eventName, reimbursement, employee } = contextData || {};
    if (!reimbursement || !employee) return [];

    const employeeName = fullName(employee);
    const expenseDate  = format(new Date(reimbursement.expenseDate), 'dd MMM yyyy');
    const amount       = reimbursement.amount?.toLocaleString?.('en-IN') || reimbursement.amount;

    // Build receipt view URL if receipt exists — points to approvals page for managers, my claims for employees
    let viewReceiptUrl = '';
    if (reimbursement.receiptFileKey) {
      const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
      viewReceiptUrl = `${clientUrl}/dashboard/reimbursements/approvals`;
    }

    const variables = {
      employeeName,
      description: reimbursement.description || '',
      category: reimbursement.category_id?.name || reimbursement.category || '',
      amount,
      expenseDate,
      status: reimbursement.status,
      rejectionReason: reimbursement.rejectionReason || '',
      paymentMode: reimbursement.paymentMode || 'payroll',
      immediatePaymentRef: reimbursement.immediatePaymentRef || '',
      viewReceiptUrl,
      hasReceipt: !!reimbursement.receiptFileKey,
    };

    const recipients = [];

    switch (eventName) {
      // ─── Submitted: notify manager with approve/reject email buttons ────────
      case 'reimbursement.submitted': {
        if (employee.reportingManager_id) {
          const manager = await Employee.findById(employee.reportingManager_id)
            .select('user_id firstName lastName')
            .lean();

          if (manager?.user_id) {
            const baseUrl = process.env.CLIENT_URL?.replace(':3000', ':5000') || 'http://localhost:5000';

            const approveToken = generateActionToken({
              requestId:  reimbursement._id.toString(),
              companyId,
              reviewerId: manager.user_id.toString(),
              action:     'approve',
            });
            const rejectToken = generateActionToken({
              requestId:  reimbursement._id.toString(),
              companyId,
              reviewerId: manager.user_id.toString(),
              action:     'reject',
            });

            const approveUrl = `${baseUrl}/api/email-actions/reimbursement/approve?token=${approveToken}`;
            const rejectUrl  = `${baseUrl}/api/email-actions/reimbursement/reject?token=${rejectToken}`;

            recipients.push({
              userId:        manager.user_id.toString(),
              recipientType: 'manager',
              variables:     { ...variables, approveUrl, rejectUrl },
              actionUrl:     '/dashboard/reimbursements',
            });
          }
        }
        break;
      }

      // ─── Manager approved: notify HR + employee ────────────────────────────
      case 'reimbursement.manager_approved': {
        // Notify employee
        if (employee.user_id) {
          recipients.push({
            userId:        employee.user_id.toString(),
            recipientType: 'employee',
            variables:     { ...variables, status: 'manager_approved' },
            actionUrl:     '/dashboard/reimbursements/my',
          });
        }

        // Notify HR users (HR Manager, HR Staff, Super Admin)
        const hrUserIds = await findHRUsers(companyId);
        for (const hrUserId of hrUserIds) {
          const baseUrl = process.env.CLIENT_URL?.replace(':3000', ':5000') || 'http://localhost:5000';

          const approveToken = generateActionToken({
            requestId:  reimbursement._id.toString(),
            companyId,
            reviewerId: hrUserId,
            action:     'approve',
          });
          const rejectToken = generateActionToken({
            requestId:  reimbursement._id.toString(),
            companyId,
            reviewerId: hrUserId,
            action:     'reject',
          });

          const approveUrl = `${baseUrl}/api/email-actions/reimbursement/approve?token=${approveToken}`;
          const rejectUrl  = `${baseUrl}/api/email-actions/reimbursement/reject?token=${rejectToken}`;

          recipients.push({
            userId:        hrUserId,
            recipientType: 'hr',
            variables:     { ...variables, approveUrl, rejectUrl },
            actionUrl:     '/dashboard/reimbursements',
          });
        }
        break;
      }

      // ─── HR approved (payroll): notify employee ────────────────────────────
      case 'reimbursement.hr_approved': {
        if (employee.user_id) {
          recipients.push({
            userId:        employee.user_id.toString(),
            recipientType: 'employee',
            variables:     { ...variables, status: 'hr_approved' },
            actionUrl:     '/dashboard/reimbursements/my',
          });
        }
        break;
      }

      // ─── Paid (immediate): notify employee ────────────────────────────────
      case 'reimbursement.paid': {
        if (employee.user_id) {
          recipients.push({
            userId:        employee.user_id.toString(),
            recipientType: 'employee',
            variables:     { ...variables, status: 'paid' },
            actionUrl:     '/dashboard/reimbursements/my',
          });
        }
        break;
      }

      // ─── Rejected: notify employee with reason ────────────────────────────
      case 'reimbursement.rejected': {
        if (employee.user_id) {
          recipients.push({
            userId:        employee.user_id.toString(),
            recipientType: 'employee',
            variables:     { ...variables, status: 'rejected' },
            actionUrl:     '/dashboard/reimbursements/my',
          });
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
