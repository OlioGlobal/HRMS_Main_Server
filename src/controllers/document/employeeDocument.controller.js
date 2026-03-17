const catchAsync      = require('../../utils/catchAsync');
const { sendSuccess } = require('../../utils/response');
const service         = require('../../services/document/employeeDocument.service');
const Employee        = require('../../models/Employee');
const AppError        = require('../../utils/AppError');

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
};
