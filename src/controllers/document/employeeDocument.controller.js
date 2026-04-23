const catchAsync        = require('../../utils/catchAsync');
const { sendSuccess }   = require('../../utils/response');
const service           = require('../../services/document/employeeDocument.service');
const Employee          = require('../../models/Employee');
const AppError          = require('../../utils/AppError');
const { sendEmail }     = require('../../utils/email');
const { _buildHrNotificationEmail } = (() => {
  // Inline minimal HR notification for document upload
  const build = ({ companyName, hrName, candidateName, designation, joiningDate, action, details, hrmsLink }) => `
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
  <div style="background:#dc2626;padding:24px 32px;"><h1 style="color:#fff;margin:0;font-size:20px;">${companyName}</h1><p style="color:#fca5a5;margin:4px 0 0;font-size:13px;">Pre-Boarding Activity</p></div>
  <div style="padding:32px;">
    <p style="margin:0 0 8px;font-size:15px;">Hi <strong>${hrName}</strong>,</p>
    <p style="margin:0 0 24px;font-size:14px;line-height:1.6;">${action}</p>
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:24px;">
      <table style="width:100%;font-size:13px;color:#374151;border-collapse:collapse;">
        <tr><td style="padding:5px 0;width:140px;color:#6b7280;">Candidate</td><td style="padding:5px 0;font-weight:600;">${candidateName}</td></tr>
        ${designation ? `<tr><td style="padding:5px 0;color:#6b7280;">Position</td><td style="padding:5px 0;">${designation}</td></tr>` : ''}
        ${details ? `<tr><td style="padding:5px 0;color:#6b7280;">Details</td><td style="padding:5px 0;">${details}</td></tr>` : ''}
      </table>
    </div>
    ${hrmsLink ? `<div style="text-align:center;margin:24px 0;"><a href="${hrmsLink}" style="background:#dc2626;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;display:inline-block;">View in HRMS →</a></div>` : ''}
  </div>
  <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 32px;text-align:center;font-size:12px;color:#9ca3af;">${companyName} HRMS · Automated notification</div>
</div></body></html>`;
  return { _buildHrNotificationEmail: build };
})();

const _resolveEmployee = async (companyId, userId) => {
  const emp = await Employee.findOne({ company_id: companyId, user_id: userId }).lean();
  if (!emp) throw new AppError('Employee record not found for current user', 404);
  return emp;
};

const listDocuments = catchAsync(async (req, res) => {
  const docs = await service.listEmployeeDocuments(req.user.companyId, req.params.employeeId, req.query);
  sendSuccess(res, { data: { documents: docs } });
});

// HR uploads document for employee (multer file)
const uploadDocument = catchAsync(async (req, res) => {
  if (!req.file) throw new AppError('No file uploaded', 400);
  const doc = await service.uploadDocument(req.user.companyId, req.params.employeeId, req.user.userId, {
    documentTypeId: req.body.documentTypeId,
    expiryDate:     req.body.expiryDate,
    file:           req.file,
  });
  sendSuccess(res, { status: 201, message: 'Document uploaded', data: { document: doc } });
});

const downloadDocument = catchAsync(async (req, res) => {
  const result = await service.getDocumentDownloadUrl(req.user.companyId, req.params.docId, req.user.userId);
  sendSuccess(res, { data: { downloadUrl: result.url } });
});

const verify = catchAsync(async (req, res) => {
  const doc = await service.verifyDocument(req.user.companyId, req.params.docId, req.user.userId);
  sendSuccess(res, { message: 'Document verified', data: { document: doc } });
});

const bulkVerify = catchAsync(async (req, res) => {
  const result = await service.bulkVerifyDocuments(req.user.companyId, req.body.docIds, req.user.userId);
  sendSuccess(res, { message: `${result.verified} document(s) verified`, data: result });
});

const reject = catchAsync(async (req, res) => {
  const doc = await service.rejectDocument(req.user.companyId, req.params.docId, req.user.userId, req.body.reason);
  sendSuccess(res, { message: 'Document rejected', data: { document: doc } });
});

const remove = catchAsync(async (req, res) => {
  await service.deleteDocument(req.user.companyId, req.params.docId, req.user.userId);
  sendSuccess(res, { message: 'Document deleted' });
});

const checklist = catchAsync(async (req, res) => {
  const list = await service.getDocumentChecklist(req.user.companyId, req.params.employeeId);
  sendSuccess(res, { data: { checklist: list } });
});

const expiring = catchAsync(async (req, res) => {
  const days = parseInt(req.query.days, 10) || 30;
  const docs = await service.getExpiringDocuments(req.user.companyId, days);
  sendSuccess(res, { data: { documents: docs } });
});

const compliance = catchAsync(async (req, res) => {
  const data = await service.getComplianceOverview(req.user.companyId);
  sendSuccess(res, { data: { compliance: data } });
});

const myDocuments = catchAsync(async (req, res) => {
  const emp = await _resolveEmployee(req.user.companyId, req.user.userId);
  const docs = await service.getMyDocuments(req.user.companyId, emp._id);
  sendSuccess(res, { data: { documents: docs } });
});

const myChecklist = catchAsync(async (req, res) => {
  const emp = await _resolveEmployee(req.user.companyId, req.user.userId);
  const list = await service.getDocumentChecklist(req.user.companyId, emp._id);
  sendSuccess(res, { data: { checklist: list } });
});

// Employee self-service upload
const myUpload = catchAsync(async (req, res) => {
  if (!req.file) throw new AppError('No file uploaded', 400);
  const emp = await _resolveEmployee(req.user.companyId, req.user.userId);
  const doc = await service.uploadDocument(req.user.companyId, emp._id, req.user.userId, {
    documentTypeId: req.body.documentTypeId,
    expiryDate:     req.body.expiryDate,
    file:           req.file,
  });
  sendSuccess(res, { status: 201, message: 'Document uploaded', data: { document: doc } });
});

const myDownload = catchAsync(async (req, res) => {
  const result = await service.getDocumentDownloadUrl(req.user.companyId, req.params.docId, req.user.userId);
  sendSuccess(res, { data: { downloadUrl: result.url } });
});

const myDelete = catchAsync(async (req, res) => {
  await service.deleteDocument(req.user.companyId, req.params.docId, req.user.userId, { isEmployeeSelf: true });
  sendSuccess(res, { message: 'Document deleted' });
});

// Pre-boarding public upload — authenticated via token
const uploadPreboarding = catchAsync(async (req, res) => {
  if (!req.file) throw new AppError('No file uploaded', 400);
  const { token, documentTypeId } = req.body;
  if (!token) throw new AppError('Missing token', 400);

  const employee = await Employee.findOne({
    preBoardingToken:       token,
    preBoardingTokenExpiry: { $gt: new Date() },
  }).populate('company_id', 'name').populate('designation_id', 'name').populate('assignedHr_id', 'firstName lastName email').lean();
  if (!employee) throw new AppError('Invalid or expired pre-boarding link.', 401);

  const doc = await service.uploadDocument(employee.company_id._id ?? employee.company_id, employee._id, employee._id, {
    documentTypeId,
    file: req.file,
  });

  // Notify assigned HR
  try {
    const hr = employee.assignedHr_id;
    if (hr?.email) {
      const companyName = employee.company_id?.name ?? 'HR Team';
      const candidateName = `${employee.firstName} ${employee.lastName}`;
      await sendEmail({
        to: hr.email,
        subject: `[Pre-Boarding] Document Uploaded — ${candidateName}`,
        html: _buildHrNotificationEmail({
          companyName,
          hrName:        hr.firstName ?? 'HR',
          candidateName,
          designation:   employee.designation_id?.name ?? '',
          joiningDate:   employee.joiningDate,
          action:        `<strong>${candidateName}</strong> has uploaded a document that requires your review.`,
          details:       `Document type: ${doc.documentType_id ?? documentTypeId}`,
          hrmsLink:      `${process.env.CLIENT_URL}/dashboard/workforce/hiring`,
        }),
      });
    }
  } catch (e) {
    console.error('[Preboarding] Doc upload notify failed:', e.message);
  }

  sendSuccess(res, { status: 201, message: 'Document uploaded', data: { document: doc } });
});

module.exports = {
  listDocuments,
  uploadDocument,
  downloadDocument,
  verify,
  bulkVerify,
  reject,
  remove,
  checklist,
  expiring,
  compliance,
  myDocuments,
  myChecklist,
  myUpload,
  myDownload,
  myDelete,
  uploadPreboarding,
};
