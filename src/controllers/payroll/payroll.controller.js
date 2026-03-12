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
};
