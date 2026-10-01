// ─── Payslip HTML template ───────────────────────────────────────────────────
// A single source of truth for the salary-slip layout, shared by the PDF
// download endpoint and the payslip email. Branding/text is driven by
// company.settings.payslip so it can be configured from Settings → Payslip.
//
// Images (logo + authorised-signatory signature) are embedded as base64 data
// URIs read straight from disk — this is the most reliable way to make them
// render inside headless-Chromium PDFs and email clients.

const fs   = require('fs');
const path = require('path');

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MIME_BY_EXT = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.gif': 'image/gif',
};

// Turn a stored image reference into a data URI. Accepts a local public path
// like "/uploads/logos/x.png" (read from disk) or an absolute http(s) URL
// (returned as-is so Chromium/email fetches it). Returns null on any failure.
const toDataUri = (ref) => {
  if (!ref) return null;
  if (/^https?:\/\//i.test(ref) || /^data:/i.test(ref)) return ref;
  try {
    const abs = path.join(process.cwd(), 'public', ref.replace(/^\/+/, ''));
    if (!fs.existsSync(abs)) return null;
    const ext  = path.extname(abs).toLowerCase();
    const mime = MIME_BY_EXT[ext] || 'image/png';
    return `data:${mime};base64,${fs.readFileSync(abs).toString('base64')}`;
  } catch {
    return null;
  }
};

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Format a Date/ISO value as "DD Mon YYYY" (UTC — matches how dates are stored).
const fmtDate = (val) => {
  if (!val) return '—';
  const dt = new Date(val);
  if (isNaN(dt.getTime())) return '—';
  return `${String(dt.getUTCDate()).padStart(2, '0')} ${MONTHS[dt.getUTCMonth()].slice(0, 3)} ${dt.getUTCFullYear()}`;
};

// ─── Assemble the flat data object the template needs ─────────────────────────
// record   – PayrollRecord (decrypted, plain object)
// employee – Employee with designation_id / department_id optionally populated
// company  – Company doc (needs name, address fields, logo, settings.*)
const buildPayslipData = ({ record, employee, company, configSnapshot }) => {
  // Prefer the payslip config that was snapshotted when the payroll run was processed,
  // so editing the config later never re-styles historical payslips. Falls back to the
  // live company config (older runs without a snapshot).
  const cfg      = configSnapshot || (company.settings && company.settings.payslip) || {};
  const currency = (company.settings && company.settings.currency) || 'USD';
  // Format using the company's currency (symbol + grouping). Falls back to a
  // plain "<CODE> 1,234" prefix if the currency code is unknown to Intl.
  let fmt;
  try {
    const nf = new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 });
    fmt = (v) => nf.format(Math.round(Number(v) || 0));
  } catch {
    fmt = (v) => `${currency} ${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(Number(v) || 0))}`;
  }

  // Address lines (skip empties). Prefer the payslip-config address override
  // (newline-separated); fall back to the company's saved address.
  const line2 = [company.city, company.state, company.pincode].filter(Boolean).join(', ');
  const addressLines = (cfg.address && cfg.address.trim())
    ? cfg.address.split('\n').map((l) => l.trim()).filter(Boolean)
    : [company.address, line2].filter(Boolean);

  // Earnings (component earnings + overtime)
  const earnings = [...(record.earnings || []).map((e) => ({ name: e.name, amount: e.amount }))];
  if (record.overtimeAmount > 0) {
    earnings.push({ name: `Overtime (${record.overtimeHours}h)`, amount: record.overtimeAmount });
  }

  // Deductions (component deductions + attendance-based deductions)
  const deductions = [...(record.deductions || []).map((d) => ({ name: d.name, amount: d.amount }))];
  if (record.lwpDeductionAmount > 0)     deductions.push({ name: `LWP (${record.lwpDays}d)`, amount: record.lwpDeductionAmount });
  if (record.absentDeductionAmount > 0)  deductions.push({ name: `Absent (${record.daysAbsent}d)`, amount: record.absentDeductionAmount });
  if (record.halfDayDeductionAmount > 0) deductions.push({ name: `Half Days (${record.halfDays})`, amount: record.halfDayDeductionAmount });
  if (record.lateDeductionAmount > 0)    deductions.push({ name: `Late (${record.deductibleLateCount}x)`, amount: record.lateDeductionAmount });

  const empName = employee
    ? `${employee.firstName || ''} ${employee.lastName || ''}`.trim()
    : (record.employeeName || '');
  const designation = employee?.designation_id?.name || employee?.designation || '—';
  const department  = employee?.department_id?.name  || employee?.department  || '—';

  const { amountInWords } = require('./numberToWords');

  return {
    companyName:   company.name || 'Company',
    addressLines,
    logoDataUri:   cfg.showLogo === false ? null : toDataUri(cfg.logo || company.logo),
    title:         cfg.title || 'PAY SLIP',
    monthLabel:    `${MONTHS[(record.month || 1) - 1]} ${record.year || ''}`.trim(),
    employeeName:  empName || '—',
    employeeId:    employee?.employeeId || '',
    designation,
    department,
    joiningDate:   fmtDate(employee?.joiningDate),
    // Manual salary slips aren't attendance-based, so the Total Days row is
    // suppressed for them (record.hideTotalDays set by the manual-slip service).
    hideTotalDays: record.hideTotalDays === true,
    totalDays:     record.totalWorkingDays || record.effectiveWorkingDays || 0,
    earnings,
    deductions,
    grossEarnings: record.grossEarnings || 0,
    totalDeductions: record.totalDeductions || 0,
    netPay:        record.netPay || 0,
    amountInWords: amountInWords(record.netPay || 0, currency),
    fmt,
    footerText:    (cfg.footerText || '').trim(),
    signatoryName: cfg.signatoryName || '',
    signatoryLabel: cfg.signatoryLabel || 'Authorized Signatory',
    signatureDataUri: toDataUri(cfg.signatureImage),
    showEmployeeSignature: cfg.showEmployeeSignature !== false,
    showWatermark: cfg.showWatermark !== false,
    watermarkText: (cfg.watermarkText || company.name || '').toUpperCase(),
  };
};

// ─── Render the flat data object into a full A4 HTML document ─────────────────
const renderPayslipHtml = (d) => {
  const fmt = d.fmt;

  // A zero-value deduction shows "NA" rather than a currency 0.
  const fmtDed = (v) => (Number(v) === 0 ? 'NA' : fmt(v));

  // Pair earnings & deductions row-by-row, padding the shorter column.
  const rowCount = Math.max(d.earnings.length, d.deductions.length, 1);
  let bodyRows = '';
  for (let i = 0; i < rowCount; i++) {
    const e = d.earnings[i];
    const x = d.deductions[i];
    bodyRows += `<tr>
      <td class="cell name">${e ? esc(e.name) : ''}</td>
      <td class="cell amt">${e ? fmt(e.amount) : ''}</td>
      <td class="cell name">${x ? esc(x.name) : ''}</td>
      <td class="cell amt">${x ? fmtDed(x.amount) : ''}</td>
    </tr>`;
  }

  const logoHtml = d.logoDataUri
    ? `<img class="logo" src="${d.logoDataUri}" alt="logo" />`
    : '';

  const watermark = d.showWatermark && d.watermarkText
    ? `<div class="watermark">${esc(d.watermarkText)}</div>`
    : '';

  const empSig = d.showEmployeeSignature ? `
        <div class="sig">
          <div class="sig-content top">
            <div class="sig-name">${esc(d.employeeName)}</div>
          </div>
          <div class="sig-line"></div>
          <div class="sig-label">Signature of Employee</div>
        </div>` : '<div class="sig"></div>';

  const signatoryImg = d.signatureDataUri
    ? `<img class="sig-img" src="${d.signatureDataUri}" alt="signature" />`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: A4; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; color: #1a1a1a; font-size: 12px; }
  .page { position: relative; width: 210mm; min-height: 297mm; padding: 18mm 16mm; }
  .watermark {
    position: absolute; top: 35%; left: 50%;
    transform: translate(-50%, -50%);
    font-size: 46px; font-weight: 700; color: rgba(0,0,0,0.05);
    white-space: nowrap; letter-spacing: 4px; pointer-events: none; z-index: 0;
  }
  .content { position: relative; z-index: 1; }

  /* Header */
  .header { display: flex; justify-content: space-between; align-items: flex-start; }
  .company-name { font-size: 18px; font-weight: 700; letter-spacing: .3px; }
  .address { font-size: 10.5px; color: #333; line-height: 1.5; margin-top: 4px; max-width: 340px; }
  .logo { max-height: 120px; max-width: 280px; object-fit: contain; }

  /* Title */
  .title-block { text-align: center; margin: 26px 0 20px; }
  .title { font-size: 15px; font-weight: 700; letter-spacing: 1px; }
  .month { font-size: 13px; font-style: italic; color: #c0392b; text-decoration: underline; margin-top: 6px; }

  /* Employee info table */
  table { border-collapse: collapse; width: 100%; }
  .info-table { margin: 0 auto 18px; width: 70%; }
  .info-table td { border: 1px solid #333; padding: 7px 10px; font-size: 12px; }
  .info-table td.k { font-weight: 600; width: 40%; }

  /* Earnings / Deductions table */
  .ed-table td, .ed-table th { border: 1px solid #333; padding: 7px 10px; font-size: 12px; }
  .ed-table th { background: #f2f2f2; text-align: center; font-weight: 700; }
  .ed-table .cell.name { width: 30%; }
  .ed-table .cell.amt { width: 20%; text-align: right; }
  .ed-table .total td { font-weight: 700; }
  .ed-table .net td { font-weight: 700; }
  .ed-table .net .net-label { text-align: left; }
  .ed-table .net .net-amt { text-align: right; }

  .ed-table .words-row td { text-align: right; font-style: italic; font-weight: 600; }

  /* Signatures — fixed-height content area so both columns' lines + labels align */
  .signatures { display: flex; justify-content: space-between; margin-top: 55px; }
  .sig { width: 45%; text-align: left; }
  .sig.right { text-align: right; }
  .sig-content { height: 100px; display: flex; flex-direction: column; justify-content: flex-end; }
  .sig-content.top { justify-content: flex-start; }
  .sig-name { font-size: 12px; }
  .sig-img { max-height: 90px; max-width: 240px; object-fit: contain; margin: 2px 0; }
  .sig.right .sig-img { margin-left: auto; }
  .sig-line { border-top: 1px dashed #333; width: 200px; margin-top: 4px; }
  .sig.right .sig-line { margin-left: auto; }
  .sig-label { font-size: 11px; color: #333; margin-top: 4px; }

  .footer { margin-top: 40px; font-size: 10px; color: #555; white-space: pre-line; }
</style>
</head>
<body>
  <div class="page">
    ${watermark}
    <div class="content">
      <div class="header">
        <div>
          <div class="company-name">${esc(d.companyName)}</div>
          ${d.addressLines.length ? `<div class="address">${d.addressLines.map(esc).join('<br/>')}</div>` : ''}
        </div>
        <div>${logoHtml}</div>
      </div>

      <div class="title-block">
        <div class="title">${esc(d.title)}</div>
        <div class="month">Month - ${esc(d.monthLabel)}</div>
      </div>

      <table class="info-table">
        <tr><td class="k">Name of Employee</td><td>${esc(d.employeeName)}</td></tr>
        <tr><td class="k">Designation</td><td>${esc(d.designation)}</td></tr>
        <tr><td class="k">Department</td><td>${esc(d.department)}</td></tr>
        <tr><td class="k">Joining Date</td><td>${esc(d.joiningDate)}</td></tr>
        ${d.hideTotalDays ? '' : `<tr><td class="k">Total Days</td><td>${esc(d.totalDays)}</td></tr>`}
        <tr><td>&nbsp;</td><td>&nbsp;</td></tr>
      </table>

      <table class="ed-table">
        <tr><th colspan="2">Earnings</th><th colspan="2">Deductions</th></tr>
        ${bodyRows}
        <tr class="total">
          <td>Total Addition</td><td class="amt" style="text-align:right">${fmt(d.grossEarnings)}</td>
          <td>Total Deduction</td><td class="amt" style="text-align:right">${fmtDed(d.totalDeductions)}</td>
        </tr>
        <tr class="net">
          <td></td><td></td>
          <td class="net-label">NET SALARY</td>
          <td class="net-amt">${fmt(d.netPay)}</td>
        </tr>
        <tr class="words-row">
          <td colspan="4">${esc(d.amountInWords)}</td>
        </tr>
      </table>

      <div class="signatures">
        ${empSig}
        <div class="sig right">
          <div class="sig-content">
            <div class="sig-name">${esc(d.signatoryName)}</div>
            ${signatoryImg}
          </div>
          <div class="sig-line"></div>
          <div class="sig-label">${esc(d.signatoryLabel)}</div>
        </div>
      </div>

      ${d.footerText ? `<div class="footer">${esc(d.footerText)}</div>` : ''}
    </div>
  </div>
</body>
</html>`;
};

// Convenience: assemble data + render in one call.
const buildPayslipHtml = ({ record, employee, company, configSnapshot }) =>
  renderPayslipHtml(buildPayslipData({ record, employee, company, configSnapshot }));

module.exports = { buildPayslipData, renderPayslipHtml, buildPayslipHtml, toDataUri };
