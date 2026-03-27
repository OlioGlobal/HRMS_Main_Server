const catchAsync   = require('../../utils/catchAsync');
const { sendSuccess } = require('../../utils/response');
const payrollService = require('../../services/payroll/payroll.service');
const Employee = require('../../models/Employee');

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
  const payslips = await payrollService.getMyPayslips(req.params.employeeId, req.user.companyId);
  sendSuccess(res, { data: { payslips } });
});

// ─── Send payslip email ────────────────────────────────────────────────────
const sendPayslipEmail = catchAsync(async (req, res) => {
  const { month, year } = req.body;
  const employee = await Employee.findOne({ _id: req.params.employeeId, company_id: req.user.companyId })
    .populate('user_id', 'email')
    .lean();
  if (!employee) throw new AppError('Employee not found.', 404);
  if (!employee.user_id?.email) throw new AppError('Employee has no email address.', 400);

  const PayrollRecord = require('../../models/PayrollRecord');
  const PayrollRun = require('../../models/PayrollRun');
  const Company = require('../../models/Company');
  const { sendEmail, compileTemplate } = require('../../utils/email');

  const run = await PayrollRun.findOne({ company_id: req.user.companyId, month, year, status: { $in: ['approved', 'paid'] } }).lean();
  if (!run) throw new AppError('No approved/paid payroll run found for this period.', 404);

  const record = await PayrollRecord.findOne({ payrollRun_id: run._id, employee_id: employee._id }).lean();
  if (!record) throw new AppError('No payroll record found for this employee.', 404);

  const company = await Company.findById(req.user.companyId).select('name').lean();
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const monthName = MONTHS[month - 1];
  const empName = `${employee.firstName} ${employee.lastName}`;
  const fmt = (v) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);

  const earningsRows = (record.earnings || [])
    .map(e => `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${e.name}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${fmt(e.amount)}</td></tr>`)
    .join('');
  const deductionRows = (record.deductions || [])
    .map(d => `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${d.name}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;color:#dc2626">-${fmt(d.amount)}</td></tr>`)
    .join('');

  const html = `<!DOCTYPE html><html><head><style>body{margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}.c{max-width:600px;margin:24px auto;background:#fff;border-radius:8px;overflow:hidden}.h{background:#18181b;padding:24px;text-align:center;color:#fff;font-size:20px;font-weight:600}.b{padding:24px;color:#27272a;line-height:1.6;font-size:14px}table{width:100%;border-collapse:collapse}td{font-size:13px}.total td{font-weight:700;background:#f5f5f5;padding:8px 10px}.net{text-align:center;padding:20px;background:#f0f7ff;border-radius:8px;margin:16px 0}.net .a{font-size:28px;font-weight:800}.f{padding:16px;text-align:center;font-size:11px;color:#a1a1aa;border-top:1px solid #e4e4e7}</style></head><body><div class="c"><div class="h">${company.name} - Payslip</div><div class="b"><p><strong>${empName}</strong> | ${monthName} ${year}</p><br/><p><strong>Earnings</strong></p><table>${earningsRows}<tr class="total"><td>Gross Earnings</td><td style="text-align:right">${fmt(record.grossEarnings)}</td></tr></table><br/><p><strong>Deductions</strong></p><table>${deductionRows}<tr class="total"><td>Total Deductions</td><td style="text-align:right;color:#dc2626">-${fmt(record.totalDeductions)}</td></tr></table><div class="net"><div style="font-size:11px;color:#666">NET PAY</div><div class="a">${fmt(record.netPay)}</div></div></div><div class="f">This is a system-generated payslip from ${company.name}.</div></div></body></html>`;

  const result = await sendEmail({
    to: employee.user_id.email,
    subject: `Payslip - ${monthName} ${year} | ${company.name}`,
    html,
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
  sendPayslipEmail,
};
