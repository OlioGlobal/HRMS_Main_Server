const catchAsync     = require('../../utils/catchAsync');
const { sendSuccess } = require('../../utils/response');
const Employee       = require('../../models/Employee');
const Reimbursement  = require('../../models/Reimbursement');
const AppError       = require('../../utils/AppError');
const eventBus       = require('../../utils/eventBus');
const { verifyActionToken } = require('../../utils/token');
const service        = require('../../services/reimbursement/reimbursement.service');

// ─── Resolve the employee record for the logged-in user ──────────────────────
const resolveEmployee = async (userId, companyId) => {
  const emp = await Employee.findOne({ user_id: userId, company_id: companyId }).lean();
  if (!emp) throw new AppError('No employee profile linked to your account.', 400);
  return emp;
};

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORY CONTROLLERS
// ═══════════════════════════════════════════════════════════════════════════════

const listCategories = catchAsync(async (req, res) => {
  const categories = await service.listCategories(req.user.companyId);
  sendSuccess(res, { data: { categories } });
});

const createCategory = catchAsync(async (req, res) => {
  const category = await service.createCategory(req.user.companyId, req.body);
  sendSuccess(res, { status: 201, message: 'Expense category created.', data: { category } });
});

const updateCategory = catchAsync(async (req, res) => {
  const category = await service.updateCategory(req.user.companyId, req.params.id, req.body);
  sendSuccess(res, { message: 'Expense category updated.', data: { category } });
});

const deleteCategory = catchAsync(async (req, res) => {
  await service.deleteCategory(req.user.companyId, req.params.id);
  sendSuccess(res, { message: 'Expense category deleted.' });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CLAIM CONTROLLERS
// ═══════════════════════════════════════════════════════════════════════════════

const createClaim = catchAsync(async (req, res) => {
  const emp = await resolveEmployee(req.user.userId, req.user.companyId);
  const claim = await service.createClaim(req.user.companyId, emp._id, req.body, req.file || null);
  sendSuccess(res, { status: 201, message: 'Reimbursement claim created.', data: { claim } });
});

const updateClaim = catchAsync(async (req, res) => {
  const emp = await resolveEmployee(req.user.userId, req.user.companyId);
  const claim = await service.updateClaim(req.user.companyId, req.params.id, emp._id, req.body, req.file || null);
  sendSuccess(res, { message: 'Reimbursement claim updated.', data: { claim } });
});

const deleteClaim = catchAsync(async (req, res) => {
  const emp = await resolveEmployee(req.user.userId, req.user.companyId);
  await service.deleteClaim(req.user.companyId, req.params.id, emp._id);
  sendSuccess(res, { message: 'Reimbursement claim deleted.' });
});

const submitClaim = catchAsync(async (req, res) => {
  const emp = await resolveEmployee(req.user.userId, req.user.companyId);
  const claim = await service.submitClaim(req.user.companyId, req.params.id, emp._id);
  sendSuccess(res, { message: 'Reimbursement claim submitted.', data: { claim } });
});

const myClaims = catchAsync(async (req, res) => {
  const emp = await resolveEmployee(req.user.userId, req.user.companyId);
  const result = await service.myClaims(req.user.companyId, emp._id, req.query);
  sendSuccess(res, { data: result });
});

// ═══════════════════════════════════════════════════════════════════════════════
// APPROVAL CONTROLLERS
// ═══════════════════════════════════════════════════════════════════════════════

const listPending = catchAsync(async (req, res) => {
  const result = await service.listPendingApprovals(
    req.user.companyId,
    req.user.userId,
    req.permissionScope,
    req.query,
  );
  sendSuccess(res, { data: result });
});

const managerApprove = catchAsync(async (req, res) => {
  const claim = await service.managerApprove(
    req.user.companyId,
    req.params.id,
    req.user.userId,
    req.body.note,
  );
  sendSuccess(res, { message: 'Claim approved by manager.', data: { claim } });
});

const hrApprove = catchAsync(async (req, res) => {
  const claim = await service.hrApprove(
    req.user.companyId,
    req.params.id,
    req.user.userId,
    req.body,
  );
  sendSuccess(res, { message: 'Claim approved by HR.', data: { claim } });
});

const rejectClaim = catchAsync(async (req, res) => {
  const claim = await service.reject(
    req.user.companyId,
    req.params.id,
    req.user.userId,
    req.body.reason,
  );
  sendSuccess(res, { message: 'Claim rejected.', data: { claim } });
});

// ═══════════════════════════════════════════════════════════════════════════════
// RECEIPT
// ═══════════════════════════════════════════════════════════════════════════════

const downloadReceipt = catchAsync(async (req, res) => {
  const result = await service.getReceiptDownloadUrl(req.user.companyId, req.params.id);
  sendSuccess(res, { data: result });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════════════════

const getMonthlySummary = catchAsync(async (req, res) => {
  const emp = await resolveEmployee(req.user.userId, req.user.companyId);
  const { month, year } = req.query;
  const now = new Date();
  const m = month || (now.getMonth() + 1);
  const y = year || now.getFullYear();

  const summary = await service.getMonthlySummary(req.user.companyId, emp._id, m, y);
  sendSuccess(res, { data: { summary } });
});

// ═══════════════════════════════════════════════════════════════════════════════
// EMAIL ACTIONS (approve/reject from email — no cookie auth, uses JWT token)
// ═══════════════════════════════════════════════════════════════════════════════

const approveFromEmail = async (req, res) => {
  try {
    const { token, action } = req.query;
    if (!token) return res.status(400).send(renderPage('Error', 'Missing token.'));

    const payload = verifyActionToken(token);
    const { requestId, companyId, reviewerId, action: tokenAction } = payload;

    if (tokenAction !== 'approve') return res.status(400).send(renderPage('Error', 'Invalid action.'));

    const claim = await Reimbursement.findOne({ _id: requestId, company_id: companyId });
    if (!claim) return res.status(404).send(renderPage('Not Found', 'Reimbursement claim not found.'));

    if (claim.status === 'submitted') {
      // Manager approval
      claim.status            = 'manager_approved';
      claim.managerApprovedBy = reviewerId;
      claim.managerApprovedAt = new Date();
      await claim.save();

      const employee = await Employee.findById(claim.employee_id).lean();
      eventBus.emit('reimbursement.manager_approved', { companyId, reimbursement: claim.toObject(), employee });

      return res.send(renderPage('Approved', 'Reimbursement claim has been approved by manager. It will now be routed to HR.'));
    } else if (claim.status === 'manager_approved') {
      // HR approval (via payroll by default from email)
      claim.status       = 'hr_approved';
      claim.hrApprovedBy = reviewerId;
      claim.hrApprovedAt = new Date();
      claim.paymentMode  = 'payroll';
      await claim.save();

      const employee = await Employee.findById(claim.employee_id).lean();
      eventBus.emit('reimbursement.hr_approved', { companyId, reimbursement: claim.toObject(), employee });

      return res.send(renderPage('Approved', 'Reimbursement claim has been approved by HR. It will be included in the next payroll.'));
    } else {
      return res.send(renderPage('Already Processed', `This reimbursement claim is already "${claim.status}".`));
    }
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).send(renderPage('Link Expired', 'This action link has expired. Please login to the HRMS to approve.'));
    }
    console.error('[EmailAction] Reimbursement approve error:', err.message);
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

    const claim = await Reimbursement.findOne({ _id: requestId, company_id: companyId });
    if (!claim) return res.status(404).send(renderPage('Not Found', 'Reimbursement claim not found.'));

    if (!['submitted', 'manager_approved'].includes(claim.status)) {
      return res.send(renderPage('Already Processed', `This reimbursement claim is already "${claim.status}".`));
    }

    // If no reason provided, show reject form
    if (!reason) {
      return res.send(renderRejectForm(token));
    }

    const rejectedAtStage = claim.status === 'submitted' ? 'manager' : 'hr';

    claim.status          = 'rejected';
    claim.rejectedBy      = reviewerId;
    claim.rejectedAt      = new Date();
    claim.rejectionReason = reason;
    claim.rejectedAtStage = rejectedAtStage;
    await claim.save();

    const employee = await Employee.findById(claim.employee_id).lean();
    eventBus.emit('reimbursement.rejected', { companyId, reimbursement: claim.toObject(), employee });

    res.send(renderPage('Rejected', `Reimbursement claim has been rejected. Reason: "${reason}"`));
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).send(renderPage('Link Expired', 'This action link has expired. Please login to the HRMS to reject.'));
    }
    console.error('[EmailAction] Reimbursement reject error:', err.message);
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
</head><body><div class="card"><h1>Reject Reimbursement Claim</h1>
<form method="GET" action="/api/email-actions/reimbursement/reject">
<input type="hidden" name="token" value="${token}">
<label>Reason for rejection *</label>
<textarea name="reason" required placeholder="Please provide a reason..."></textarea>
<button type="submit">Reject Claim</button>
</form></div></body></html>`;
}

module.exports = {
  // Categories
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  // Claims
  createClaim,
  updateClaim,
  deleteClaim,
  submitClaim,
  myClaims,
  // Approvals
  listPending,
  managerApprove,
  hrApprove,
  rejectClaim,
  // Receipt
  downloadReceipt,
  // Summary
  getMonthlySummary,
  // Email actions
  approveFromEmail,
  rejectFromEmail,
};
