const catchAsync   = require('../../utils/catchAsync');
const { sendSuccess } = require('../../utils/response');
const AppError     = require('../../utils/AppError');
const payrollService = require('../../services/payroll/payroll.service');
const Employee = require('../../models/Employee');
const { buildPayslipHtml } = require('../../utils/payslipTemplate');
const { htmlToPdfBuffer } = require('../../utils/pdf');

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// Filename-safe payslip name, e.g. "Payslip-Shaun-Caldeira-August-2025.pdf"
const payslipFileName = (record, employee) => {
  const name = employee ? `${employee.firstName || ''}-${employee.lastName || ''}` : 'payslip';
  return `Payslip-${name}-${MONTHS[(record.month || 1) - 1]}-${record.year || ''}.pdf`
    .replace(/\s+/g, '-').replace(/-+/g, '-');
};

// ─── Payroll Runs ───────────────────────────────────────────────────────────
const initiateRun = catchAsync(async (req, res) => {
  const { month, year, notes } = req.body;
  const run = await payrollService.initiateRun(req.user.companyId, month, year, req.user.userId);
  if (notes) { run.notes = notes; await run.save(); }
  sendSuccess(res, { status: 201, message: 'Payroll run created.', data: { run } });
});

const processRun = catchAsync(async (req, res) => {
  const run = await payrollService.processRun(req.params.id, req.user.companyId);
  sendSuccess(res, { message: 'Payroll processing complete.', data: { run } });
});

const listRuns = catchAsync(async (req, res) => {
  const result = await payrollService.listRuns(req.user.companyId, req.query);
  sendSuccess(res, { data: result });
});

const getRun = catchAsync(async (req, res) => {
  const run = await payrollService.getRun(req.params.id, req.user.companyId);
  sendSuccess(res, { data: { run } });
});

const approveRun = catchAsync(async (req, res) => {
  const run = await payrollService.approveRun(req.params.id, req.user.companyId, req.user.userId);
  sendSuccess(res, { message: 'Payroll approved.', data: { run } });
});

const markPaid = catchAsync(async (req, res) => {
  const run = await payrollService.markPaid(req.params.id, req.user.companyId);
  sendSuccess(res, { message: 'Payroll marked as paid.', data: { run } });
});

const deleteRun = catchAsync(async (req, res) => {
  await payrollService.deleteRun(req.params.id, req.user.companyId);
  sendSuccess(res, { message: 'Payroll run deleted.' });
});

// ─── Payroll Records ────────────────────────────────────────────────────────
const getRecords = catchAsync(async (req, res) => {
  const result = await payrollService.getRecords(req.params.id, req.user.companyId, req.query);
  sendSuccess(res, { data: result });
});

const getRecord = catchAsync(async (req, res) => {
  const record = await payrollService.getRecord(req.params.id, req.params.empId, req.user.companyId);
  sendSuccess(res, { data: { record } });
});

const editRecord = catchAsync(async (req, res) => {
  const record = await payrollService.editRecord(
    req.params.id, req.params.empId, req.user.companyId, req.body, req.user.userId
  );
  sendSuccess(res, { message: 'Record updated.', data: { record } });
});

const skipRecord = catchAsync(async (req, res) => {
  const record = await payrollService.skipRecord(req.params.id, req.params.empId, req.user.companyId);
  sendSuccess(res, { message: 'Employee skipped from this run.', data: { record } });
});

// ─── Payslips (Employee Self) ───────────────────────────────────────────────
const getMyPayslips = catchAsync(async (req, res) => {
  const employee = await Employee.findOne({ user_id: req.user.userId, company_id: req.user.companyId });
  if (!employee) {
    return sendSuccess(res, { data: { payslips: [] }, message: 'No employee profile linked.' });
  }
  const payslips = await payrollService.getMyPayslips(employee._id, req.user.companyId);
  sendSuccess(res, { data: { payslips } });
});

// ─── Payslips (HR — any employee) ───────────────────────────────────────────
const getEmployeePayslips = catchAsync(async (req, res) => {
  // Enforce permission scope: a 'self'-scoped grant may only read the caller's
  // own payslips — never another employee's (prevents IDOR via employeeId).
  if (req.permissionScope === 'self') {
    const self = await Employee.findOne({ user_id: req.user.userId, company_id: req.user.companyId }).select('_id').lean();
    if (!self || String(self._id) !== String(req.params.employeeId)) {
      throw new AppError('You can only view your own payslips.', 403);
    }
  }
  const payslips = await payrollService.getMyPayslips(req.params.employeeId, req.user.companyId);
  sendSuccess(res, { data: { payslips } });
});

// ─── Download payslip PDF (self) ────────────────────────────────────────────
const downloadMyPayslip = catchAsync(async (req, res) => {
  const employee = await Employee.findOne({ user_id: req.user.userId, company_id: req.user.companyId }).select('_id').lean();
  if (!employee) throw new AppError('No employee profile linked to your account.', 404);
  await streamPayslipPdf(res, employee._id, req.user.companyId, req.query.month, req.query.year);
});

// ─── Download payslip PDF (HR — any employee) ───────────────────────────────
const downloadEmployeePayslip = catchAsync(async (req, res) => {
  // Same self-scope guard as viewing (prevents IDOR via employeeId).
  if (req.permissionScope === 'self') {
    const self = await Employee.findOne({ user_id: req.user.userId, company_id: req.user.companyId }).select('_id').lean();
    if (!self || String(self._id) !== String(req.params.employeeId)) {
      throw new AppError('You can only download your own payslips.', 403);
    }
  }
  await streamPayslipPdf(res, req.params.employeeId, req.user.companyId, req.query.month, req.query.year);
});

// Shared: build the payslip PDF for a period and stream it as a download.
const streamPayslipPdf = async (res, employeeId, companyId, month, year) => {
  const m = parseInt(month, 10);
  const y = parseInt(year, 10);
  if (!m || !y) throw new AppError('month and year are required.', 400);

  const { record, employee, company } = await payrollService.getPayslipContext(employeeId, companyId, m, y);
  const html = buildPayslipHtml({ record, employee, company });
  const pdf  = await htmlToPdfBuffer(html);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${payslipFileName(record, employee)}"`);
  res.send(pdf);
};

// ─── Send payslip email (PDF attached) ──────────────────────────────────────
const sendPayslipEmail = catchAsync(async (req, res) => {
  const { month, year } = req.body;
  const employee = await Employee.findOne({ _id: req.params.employeeId, company_id: req.user.companyId })
    .populate('user_id', 'email')
    .populate('designation_id', 'name')
    .populate('department_id', 'name');
  if (!employee) throw new AppError('Employee not found.', 404);
  if (!employee.user_id?.email) throw new AppError('Employee has no email address.', 400);

  const { sendEmail } = require('../../utils/email');
  const { record, company } = await payrollService.getPayslipContext(employee._id, req.user.companyId, month, year);

  // The formal payslip travels as a PDF attachment; the email body is a short note.
  const html = buildPayslipHtml({ record, employee, company });
  const pdf  = await htmlToPdfBuffer(html);
  const monthName = MONTHS[month - 1];
  const empName = `${employee.firstName} ${employee.lastName}`;

  const bodyHtml = `<!DOCTYPE html><html><head><style>body{margin:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}.c{max-width:560px;margin:24px auto;background:#fff;border-radius:8px;overflow:hidden}.h{background:#18181b;padding:22px;text-align:center;color:#fff;font-size:18px;font-weight:600}.b{padding:24px;color:#27272a;line-height:1.6;font-size:14px}.f{padding:16px;text-align:center;font-size:11px;color:#a1a1aa;border-top:1px solid #e4e4e7}</style></head><body><div class="c"><div class="h">${company.name}</div><div class="b"><p>Dear ${empName},</p><br/><p>Please find your payslip for <strong>${monthName} ${year}</strong> attached as a PDF.</p><br/><p>Regards,<br/>${company.name} Payroll</p></div><div class="f">This is a system-generated email from ${company.name}.</div></div></body></html>`;

  const result = await sendEmail({
    to: employee.user_id.email,
    subject: `Payslip - ${monthName} ${year} | ${company.name}`,
    html: bodyHtml,
    attachments: [{ filename: payslipFileName(record, employee), content: pdf, contentType: 'application/pdf' }],
  });

  if (!result.success) throw new AppError(`Failed to send email: ${result.error}`, 500);
  sendSuccess(res, { message: `Payslip sent to ${employee.user_id.email}` });
});

module.exports = {
  initiateRun,
  processRun,
  listRuns,
  getRun,
  approveRun,
  markPaid,
  deleteRun,
  getRecords,
  getRecord,
  editRecord,
  skipRecord,
  getMyPayslips,
  getEmployeePayslips,
  downloadMyPayslip,
  downloadEmployeePayslip,
  sendPayslipEmail,
};
