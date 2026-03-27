const catchAsync     = require('../../utils/catchAsync');
const { sendSuccess } = require('../../utils/response');
const Employee       = require('../../models/Employee');
const WFHRequest     = require('../../models/WFHRequest');
const AppError       = require('../../utils/AppError');
const eventBus       = require('../../utils/eventBus');
const { verifyActionToken } = require('../../utils/token');
const service        = require('../../services/wfh/wfh.service');

// Resolve the employee record for the logged-in user
const resolveEmployee = async (userId, companyId) => {
  const emp = await Employee.findOne({ user_id: userId, company_id: companyId }).lean();
  if (!emp) throw new AppError('No employee profile linked to your account.', 400);
  return emp;
};

const apply = catchAsync(async (req, res) => {
  const emp = await resolveEmployee(req.user.userId, req.user.companyId);
  const request = await service.applyWFH(req.user.companyId, emp._id, req.body);
  sendSuccess(res, { status: 201, message: 'WFH request submitted.', data: { request } });
});

const myRequests = catchAsync(async (req, res) => {
  const emp = await resolveEmployee(req.user.userId, req.user.companyId);
  const result = await service.myRequests(req.user.companyId, emp._id, req.query);
  sendSuccess(res, { data: result });
});

const listRequests = catchAsync(async (req, res) => {
  const result = await service.listRequests(
    req.user.companyId,
    req.user.userId,
    req.permissionScope,
    req.query,
  );
  sendSuccess(res, { data: result });
});

const approve = catchAsync(async (req, res) => {
  const request = await service.approveRequest(
    req.user.companyId,
    req.params.id,
    req.user.userId,
  );
  sendSuccess(res, { message: 'WFH request approved.', data: { request } });
});

const reject = catchAsync(async (req, res) => {
  const request = await service.rejectRequest(
    req.user.companyId,
    req.params.id,
    req.user.userId,
    req.body.reason,
  );
  sendSuccess(res, { message: 'WFH request rejected.', data: { request } });
});

const cancel = catchAsync(async (req, res) => {
  const emp = await resolveEmployee(req.user.userId, req.user.companyId);
  const request = await service.cancelRequest(req.user.companyId, req.params.id, emp._id);
  sendSuccess(res, { message: 'WFH request cancelled.', data: { request } });
});

// ─── Email action handlers (GET with JWT token in query) ─────────────────────
const approveFromEmail = async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).send(renderPage('Error', 'Missing token.'));

    const payload = verifyActionToken(token);
    const { requestId, companyId, reviewerId, action } = payload;

    if (action !== 'approve') return res.status(400).send(renderPage('Error', 'Invalid action.'));

    const request = await WFHRequest.findOne({ _id: requestId, company_id: companyId });
    if (!request) return res.status(404).send(renderPage('Not Found', 'WFH request not found.'));
    if (request.status !== 'pending') {
      return res.send(renderPage('Already Processed', `This WFH request is already "${request.status}".`));
    }

    request.status     = 'approved';
    request.approvedBy = reviewerId;
    request.approvedAt = new Date();
    await request.save();

    const employee = await Employee.findById(request.employee_id).lean();
    eventBus.emit('wfh.approved', { companyId, wfhRequest: request.toObject(), employee });

    res.send(renderPage('Approved', 'WFH request has been approved successfully.'));
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).send(renderPage('Link Expired', 'This action link has expired. Please login to the HRMS to approve.'));
    }
    console.error('[EmailAction] WFH approve error:', err.message);
    res.status(500).send(renderPage('Error', 'Something went wrong. Please login to the HRMS.'));
  }
};

const rejectFromEmail = async (req, res) => {
  try {
    const { token, reason } = req.query;
    if (!token) return res.status(400).send(renderPage('Error', 'Missing token.'));

    const payload = verifyActionToken(token);
    const { requestId, companyId, reviewerId, action } = payload;

    if (action !== 'reject') return res.status(400).send(renderPage('Error', 'Invalid action.'));

    const request = await WFHRequest.findOne({ _id: requestId, company_id: companyId });
    if (!request) return res.status(404).send(renderPage('Not Found', 'WFH request not found.'));
    if (request.status !== 'pending') {
      return res.send(renderPage('Already Processed', `This WFH request is already "${request.status}".`));
    }

    // If no reason provided, show reject form
    if (!reason) {
      return res.send(renderRejectForm(token));
    }

    request.status         = 'rejected';
    request.approvedBy     = reviewerId;
    request.approvedAt     = new Date();
    request.rejectedReason = reason;
    await request.save();

    const employee = await Employee.findById(request.employee_id).lean();
    eventBus.emit('wfh.rejected', { companyId, wfhRequest: request.toObject(), employee });

    res.send(renderPage('Rejected', `WFH request has been rejected. Reason: "${reason}"`));
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).send(renderPage('Link Expired', 'This action link has expired. Please login to the HRMS to reject.'));
    }
    console.error('[EmailAction] WFH reject error:', err.message);
    res.status(500).send(renderPage('Error', 'Something went wrong. Please login to the HRMS.'));
  }
};

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
</head><body><div class="card"><h1>Reject WFH Request</h1>
<form method="GET" action="/api/email-actions/wfh/reject">
<input type="hidden" name="token" value="${token}">
<label>Reason for rejection *</label>
<textarea name="reason" required placeholder="Please provide a reason..."></textarea>
<button type="submit">Reject WFH Request</button>
</form></div></body></html>`;
}

module.exports = { apply, myRequests, listRequests, approve, reject, cancel, approveFromEmail, rejectFromEmail };
