const express = require('express');
const router = express.Router();
const { verifyActionToken } = require('../utils/token');
const LeaveRequest = require('../models/LeaveRequest');
const LeaveBalance = require('../models/LeaveBalance');
const Employee = require('../models/Employee');
const eventBus = require('../utils/eventBus');

/**
 * Email action routes — no cookie auth, uses JWT token in query string.
 * These are clicked directly from email links.
 */

// GET /api/email-actions/leave/approve?token=xxx
router.get('/leave/approve', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).send(renderPage('Error', 'Missing token.'));

    const payload = verifyActionToken(token);
    const { requestId, companyId, reviewerId, action } = payload;

    if (action !== 'approve') return res.status(400).send(renderPage('Error', 'Invalid action.'));

    const request = await LeaveRequest.findOne({ _id: requestId, company_id: companyId });
    if (!request) return res.status(404).send(renderPage('Not Found', 'Leave request not found.'));
    if (request.status !== 'pending') return res.send(renderPage('Already Processed', `This leave request is already "${request.status}".`));

    // Approve
    request.status = 'approved';
    request.reviewedBy = reviewerId;
    request.reviewedAt = new Date();
    await request.save();

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

    // Emit event for notification
    const employee = await Employee.findById(request.employee_id).lean();
    eventBus.emit('leave.approved', { companyId, leaveRequest: request.toObject(), employee });

    res.send(renderPage('Approved ✅', `Leave request has been approved successfully.`));
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).send(renderPage('Link Expired', 'This action link has expired. Please login to the HRMS to approve.'));
    }
    console.error('[EmailAction] approve error:', err.message);
    res.status(500).send(renderPage('Error', 'Something went wrong. Please login to the HRMS.'));
  }
});

// GET /api/email-actions/leave/reject?token=xxx
router.get('/leave/reject', async (req, res) => {
  try {
    const { token, reason } = req.query;
    if (!token) return res.status(400).send(renderPage('Error', 'Missing token.'));

    const payload = verifyActionToken(token);
    const { requestId, companyId, reviewerId, action } = payload;

    if (action !== 'reject') return res.status(400).send(renderPage('Error', 'Invalid action.'));

    const request = await LeaveRequest.findOne({ _id: requestId, company_id: companyId });
    if (!request) return res.status(404).send(renderPage('Not Found', 'Leave request not found.'));
    if (request.status !== 'pending') return res.send(renderPage('Already Processed', `This leave request is already "${request.status}".`));

    // If no reason, show form
    if (!reason) {
      return res.send(renderRejectForm(token));
    }

    // Reject
    request.status = 'rejected';
    request.reviewedBy = reviewerId;
    request.reviewedAt = new Date();
    request.reviewNote = reason;
    await request.save();

    // Restore pending balance
    if (!request.isLWP) {
      const balance = await LeaveBalance.findOne({
        company_id: companyId,
        employee_id: request.employee_id,
        leaveType_id: request.leaveType_id,
        year: request.startDate.getFullYear(),
      });
      if (balance) {
        balance.pending = Math.max(0, balance.pending - request.totalDays);
        await balance.save();
      }
    }

    // Emit event for notification
    const employee = await Employee.findById(request.employee_id).lean();
    eventBus.emit('leave.rejected', { companyId, leaveRequest: request.toObject(), employee });

    res.send(renderPage('Rejected ❌', `Leave request has been rejected. Reason: "${reason}"`));
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).send(renderPage('Link Expired', 'This action link has expired. Please login to the HRMS to reject.'));
    }
    console.error('[EmailAction] reject error:', err.message);
    res.status(500).send(renderPage('Error', 'Something went wrong. Please login to the HRMS.'));
  }
});

/** Render a simple HTML page */
function renderPage(title, message) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f4f5f7;display:flex;justify-content:center;align-items:center;min-height:100vh}
.card{background:#fff;border-radius:12px;padding:40px;max-width:450px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.08)}
h1{font-size:24px;margin:0 0 12px;color:#18181b}p{font-size:15px;color:#52525b;margin:0;line-height:1.6}</style>
</head><body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>`;
}

/** Render reject form asking for reason */
function renderRejectForm(token) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f4f5f7;display:flex;justify-content:center;align-items:center;min-height:100vh}
.card{background:#fff;border-radius:12px;padding:40px;max-width:450px;box-shadow:0 2px 8px rgba(0,0,0,0.08)}
h1{font-size:20px;margin:0 0 16px;color:#18181b}label{font-size:14px;color:#52525b;display:block;margin-bottom:6px}
textarea{width:100%;border:1px solid #d4d4d8;border-radius:8px;padding:10px;font-size:14px;resize:vertical;min-height:80px;font-family:inherit;box-sizing:border-box}
button{margin-top:16px;width:100%;padding:12px;background:#dc2626;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer}
button:hover{background:#b91c1c}</style>
</head><body><div class="card"><h1>Reject Leave Request</h1>
<form method="GET" action="/api/email-actions/leave/reject">
<input type="hidden" name="token" value="${token}">
<label>Reason for rejection *</label>
<textarea name="reason" required placeholder="Please provide a reason..."></textarea>
<button type="submit">Reject Leave</button>
</form></div></body></html>`;
}

module.exports = router;
