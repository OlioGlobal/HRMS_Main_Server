// ─── Payroll Report ──────────────────────────────────────────────────────────
// Builds a per-employee payroll report for a single payroll run, with dynamic
// columns for every earning/deduction component, plus a department-wise summary.
const mongoose      = require('mongoose');
const PayrollRun    = require('../../models/PayrollRun');
const PayrollRecord = require('../../models/PayrollRecord');
const AppError      = require('../../utils/AppError');
const { decryptPayrollDoc } = require('../../utils/encryption');

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const STATUS_LABEL = { ready: 'Ready', edited: 'Edited', skipped: 'Skipped', warning: 'Warning' };
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * @param {string} companyId
 * @param {{ runId:string, departmentId?:string }} opts
 * @returns {Promise<{ filename:string, sheets:Object[] }>}
 */
const generatePayrollReport = async (companyId, { runId, departmentId }) => {
  if (!runId) throw new AppError('A payroll run is required.', 400);

  const run = await PayrollRun.findOne({ _id: runId, company_id: companyId }).lean();
  if (!run) throw new AppError('Payroll run not found.', 404);

  const Company = require('../../models/Company');
  const company = await Company.findById(companyId).select('name').lean();

  // Fetch all records with employee → department/designation populated.
  const raw = await PayrollRecord.find({ payrollRun_id: runId, company_id: companyId })
    .populate({
      path: 'employee_id',
      select: 'employeeId firstName lastName department_id designation_id',
      populate: [
        { path: 'department_id', select: 'name' },
        { path: 'designation_id', select: 'name' },
      ],
    })
    .lean();

  let records = raw
    .map(decryptPayrollDoc)
    .filter((r) => r.employee_id); // guard against orphaned records

  if (departmentId) {
    records = records.filter((r) => String(r.employee_id.department_id?._id || r.employee_id.department_id) === String(departmentId));
  }

  if (!records.length) throw new AppError('No payroll records match the selected filters.', 404);

  // Sort by department then name for a readable report.
  records.sort((a, b) => {
    const da = a.employee_id.department_id?.name || '';
    const db = b.employee_id.department_id?.name || '';
    if (da !== db) return da.localeCompare(db);
    return (a.employee_id.firstName || '').localeCompare(b.employee_id.firstName || '');
  });

  // ─── Collect the union of component names (preserve first-seen order) ─────
  const earningNames = [];
  const deductionNames = [];
  for (const r of records) {
    for (const e of r.earnings || []) if (e.name && !earningNames.includes(e.name)) earningNames.push(e.name);
    for (const d of r.deductions || []) if (d.name && !deductionNames.includes(d.name)) deductionNames.push(d.name);
  }

  // ─── Detailed rows ───────────────────────────────────────────────────────
  const detailRows = [];
  const totals = {
    gross: 0, totalDeductions: 0, reimb: 0, net: 0,
    earn: earningNames.map(() => 0),
    ded: deductionNames.map(() => 0),
  };

  for (const r of records) {
    const emp = r.employee_id;
    const earnMap = {};
    for (const e of r.earnings || []) earnMap[e.name] = (earnMap[e.name] || 0) + (Number(e.amount) || 0);
    const dedMap = {};
    for (const d of r.deductions || []) dedMap[d.name] = (dedMap[d.name] || 0) + (Number(d.amount) || 0);

    const row = {
      employeeId:  emp.employeeId || '',
      name:        `${emp.firstName || ''} ${emp.lastName || ''}`.trim(),
      department:  emp.department_id?.name || '',
      designation: emp.designation_id?.name || '',
      workingDays: r.totalWorkingDays || 0,
      paidDays:    r.daysWorked || 0,
      halfDays:    r.halfDays || 0,
      absent:      r.daysAbsent || 0,
      lop:         r.lwpDays || 0,
      paidLeave:   r.paidLeaveDays || 0,
      late:        r.lateCount || 0,
      ot:          r.overtimeHours || 0,
      gross:       round2(r.grossEarnings),
      totalDeductions: round2(r.totalDeductions),
      reimb:       round2(r.reimbursementTotal),
      net:         round2(r.netPay),
      status:      STATUS_LABEL[r.status] || r.status || '',
    };

    earningNames.forEach((n, i) => {
      const v = round2(earnMap[n] || 0);
      row[`earn_${i}`] = v;
      totals.earn[i] += v;
    });
    deductionNames.forEach((n, i) => {
      const v = round2(dedMap[n] || 0);
      row[`ded_${i}`] = v;
      totals.ded[i] += v;
    });

    totals.gross           += row.gross;
    totals.totalDeductions += row.totalDeductions;
    totals.reimb           += row.reimb;
    totals.net             += row.net;

    detailRows.push(row);
  }

  // ─── Detailed columns ────────────────────────────────────────────────────
  const detailColumns = [
    { header: 'Emp ID', key: 'employeeId', width: 12 },
    { header: 'Name', key: 'name', width: 22 },
    { header: 'Department', key: 'department', width: 18 },
    { header: 'Designation', key: 'designation', width: 18 },
    { header: 'Working Days', key: 'workingDays', width: 12, align: 'center', type: 'number' },
    { header: 'Paid Days', key: 'paidDays', width: 10, align: 'center', type: 'number' },
    { header: 'Half Days', key: 'halfDays', width: 9, align: 'center', type: 'number' },
    { header: 'Absent', key: 'absent', width: 8, align: 'center', type: 'number' },
    { header: 'LOP', key: 'lop', width: 8, align: 'center', type: 'number' },
    { header: 'Paid Leave', key: 'paidLeave', width: 10, align: 'center', type: 'number' },
    { header: 'Late', key: 'late', width: 7, align: 'center', type: 'number' },
    { header: 'OT Hrs', key: 'ot', width: 8, align: 'right', type: 'number' },
    ...earningNames.map((n, i) => ({ header: n, key: `earn_${i}`, width: 14, align: 'right', type: 'currency' })),
    { header: 'Gross', key: 'gross', width: 14, align: 'right', type: 'currency' },
    ...deductionNames.map((n, i) => ({ header: n, key: `ded_${i}`, width: 14, align: 'right', type: 'currency' })),
    { header: 'Total Deductions', key: 'totalDeductions', width: 15, align: 'right', type: 'currency' },
    { header: 'Reimbursements', key: 'reimb', width: 14, align: 'right', type: 'currency' },
    { header: 'Net Pay', key: 'net', width: 15, align: 'right', type: 'currency' },
    { header: 'Status', key: 'status', width: 10, align: 'center' },
  ];

  const totalsRow = { name: 'TOTAL', gross: round2(totals.gross), totalDeductions: round2(totals.totalDeductions), reimb: round2(totals.reimb), net: round2(totals.net) };
  earningNames.forEach((n, i) => { totalsRow[`earn_${i}`] = round2(totals.earn[i]); });
  deductionNames.forEach((n, i) => { totalsRow[`ded_${i}`] = round2(totals.ded[i]); });

  // ─── Department-wise summary ─────────────────────────────────────────────
  const byDept = new Map();
  for (const r of records) {
    const dept = r.employee_id.department_id?.name || '(No Department)';
    if (!byDept.has(dept)) byDept.set(dept, { department: dept, headCount: 0, gross: 0, totalDeductions: 0, net: 0, lop: 0 });
    const g = byDept.get(dept);
    g.headCount++;
    g.gross           += Number(r.grossEarnings) || 0;
    g.totalDeductions += Number(r.totalDeductions) || 0;
    g.net             += Number(r.netPay) || 0;
    g.lop             += Number(r.lwpDays) || 0;
  }
  const summaryRows = [...byDept.values()].map((g) => ({
    department: g.department, headCount: g.headCount,
    gross: round2(g.gross), totalDeductions: round2(g.totalDeductions), net: round2(g.net), lop: round2(g.lop),
  }));

  const summaryColumns = [
    { header: 'Department', key: 'department', width: 24 },
    { header: 'Head Count', key: 'headCount', width: 12, align: 'center', type: 'number' },
    { header: 'Total Gross', key: 'gross', width: 16, align: 'right', type: 'currency' },
    { header: 'Total Deductions', key: 'totalDeductions', width: 16, align: 'right', type: 'currency' },
    { header: 'Total Net Pay', key: 'net', width: 16, align: 'right', type: 'currency' },
    { header: 'Total LOP Days', key: 'lop', width: 14, align: 'center', type: 'number' },
  ];
  const summaryTotals = {
    department: 'TOTAL',
    headCount: records.length,
    gross: round2(totals.gross),
    totalDeductions: round2(totals.totalDeductions),
    net: round2(totals.net),
    lop: round2(summaryRows.reduce((s, r) => s + r.lop, 0)),
  };

  // ─── Assemble ────────────────────────────────────────────────────────────
  const periodLabel = `${MONTHS[run.month - 1]} ${run.year}`;
  const subtitles = [
    `${company?.name || 'Company'} — Payroll Report`,
    `Period: ${periodLabel}    |    Status: ${run.status}    |    Employees: ${records.length}`,
  ];

  const sheets = [
    { name: 'Summary', title: 'Payroll Summary', subtitles, columns: summaryColumns, rows: summaryRows, totals: summaryTotals },
    { name: 'Detailed', title: 'Payroll Detail', subtitles, columns: detailColumns, rows: detailRows, totals: totalsRow },
  ];

  const filename = `Payroll-${MONTHS[run.month - 1]}-${run.year}.xlsx`;
  return { filename, sheets };
};

module.exports = { generatePayrollReport };
