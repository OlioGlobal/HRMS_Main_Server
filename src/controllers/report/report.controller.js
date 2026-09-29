const catchAsync = require('../../utils/catchAsync');
const { buildWorkbook } = require('../../utils/export/excel');
const { generateAttendanceReport } = require('../../services/report/attendanceReport.service');
const { generatePayrollReport } = require('../../services/report/payrollReport.service');

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const streamXlsx = async (res, { filename, sheets, buffer }) => {
  // Attendance report ships a pre-built (custom-styled) buffer; payroll ships sheet defs.
  const buf = buffer || await buildWorkbook(sheets);
  res.setHeader('Content-Type', XLSX_MIME);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', buf.length);
  res.send(buf);
};

// GET /api/reports/attendance/export?month=&year=&employeeId=&teamId=&format=xlsx
const exportAttendance = catchAsync(async (req, res) => {
  const { month, year, employeeId, teamId } = req.query;
  const report = await generateAttendanceReport(req.user.companyId, {
    month, year,
    employeeId: employeeId || undefined,
    teamId: teamId || undefined,
  });
  await streamXlsx(res, report);
});

// GET /api/reports/payroll/export?runId=&departmentId=&format=xlsx
const exportPayroll = catchAsync(async (req, res) => {
  const { runId, departmentId } = req.query;
  const report = await generatePayrollReport(req.user.companyId, {
    runId,
    departmentId: departmentId || undefined,
  });
  await streamXlsx(res, report);
});

module.exports = { exportAttendance, exportPayroll };
