const GeneratedLetter  = require('../../models/GeneratedLetter');
const LetterTemplate   = require('../../models/LetterTemplate');
const HiringPipeline   = require('../../models/HiringPipeline');
const Employee         = require('../../models/Employee');
const Company          = require('../../models/Company');
const AppError         = require('../../utils/AppError');
const { resolveVariables, compileContent } = require('./variableResolver.service');
const { sendEmail }    = require('../../utils/email');
const { v4: uuidv4 }  = require('uuid');

// ─── List ──────────────────────────────────────────────────────────────────────
const list = async (companyId, query = {}) => {
  const filter = { company_id: companyId };
  if (query.employee_id || query.employeeId) filter.employee_id = query.employee_id ?? query.employeeId;
  if (query.letterType)  filter.letterType  = query.letterType;
  if (query.status)      filter.status      = query.status;

  return GeneratedLetter.find(filter)
    .populate('employee_id', 'firstName lastName employeeId designation_id')
    .populate('template_id', 'name letterType')
    .sort({ createdAt: -1 })
    .lean();
};

const getOne = async (companyId, id) => {
  const letter = await GeneratedLetter.findOne({ _id: id, company_id: companyId })
    .populate('employee_id', 'firstName lastName employeeId email personalEmail designation_id')
    .populate('template_id', 'name letterType signatoryName signatoryTitle signatoryEmail')
    .lean();
  if (!letter) throw new AppError('Letter not found.', 404);
  return letter;
};

// ─── Generate ──────────────────────────────────────────────────────────────────
const generate = async (companyId, userId, body) => {
  const { employee_id, template_id, letterType, manualInputs = {}, pipeline_id, pipelineStep, requiresAcceptance } = body;

  const [employee, template] = await Promise.all([
    Employee.findOne({ _id: employee_id, company_id: companyId }).lean(),
    LetterTemplate.findOne({ _id: template_id, company_id: companyId, isActive: true }).lean(),
  ]);

  if (!employee) throw new AppError('Employee not found.', 404);
  if (!template) throw new AppError('Letter template not found.', 404);

  // Resolve auto variables
  const autoVars = await resolveVariables(companyId, employee_id);

  // Merge manual inputs into variable map
  const allVars = { ...autoVars };
  for (const [key, val] of Object.entries(manualInputs)) {
    allVars[`manual.${key}`] = val;
    allVars[key] = val;
  }

  // Compile final HTML
  const resolvedContent = compileContent(template.content, allVars);

  // Build full print-ready HTML
  const printHtml = _buildPrintHtml(resolvedContent, template, employee, allVars);

  const letter = await GeneratedLetter.create({
    company_id:  companyId,
    employee_id,
    template_id,
    letterType:  letterType ?? template.letterType,
    pipeline_id:  pipeline_id  ?? null,
    pipelineStep: pipelineStep ?? null,
    resolvedContent: printHtml,
    manualInputs,
    requiresAcceptance: requiresAcceptance ?? template.requiresAcceptance ?? true,
    generatedBy: userId,
    status: 'draft',
  });

  // Advance pipeline step if applicable
  if (pipeline_id && pipelineStep !== undefined) {
    const pipeline = await HiringPipeline.findById(pipeline_id).lean();
    const step = pipeline?.steps?.find(s => s.order === pipelineStep);
    if (step?.setStatusTo && step.setStatusTo !== employee.status) {
      await Employee.updateOne({ _id: employee_id }, { $set: { status: step.setStatusTo } });
    }
  }

  return letter.toObject();
};

// ─── Send via email ────────────────────────────────────────────────────────────
const send = async (companyId, letterId, userId) => {
  const letter = await GeneratedLetter.findOne({ _id: letterId, company_id: companyId })
    .populate({ path: 'employee_id', populate: { path: 'designation_id', select: 'name' } })
    .populate('template_id', 'name signatoryName signatoryTitle signatoryEmail')
    .lean();

  if (!letter) throw new AppError('Letter not found.', 404);

  const employee = letter.employee_id;
  const toEmail  = employee.personalEmail || employee.email;
  if (!toEmail)  throw new AppError('Employee has no email address to send to.', 400);

  const company = await Company.findById(companyId).select('name').lean();
  const companyName = company?.name || 'HR Team';

  // Always generate a portal token so the candidate can view (and optionally accept) the letter
  const token  = uuidv4();
  const expiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  await Employee.updateOne(
    { _id: employee._id },
    { $set: { preBoardingToken: token, preBoardingTokenExpiry: expiry } }
  );
  const portalLink = `${process.env.CLIENT_URL}/preboarding?token=${token}`;

  const letterName = letter.template_id?.name ?? letter.letterType;
  const emailHtml  = _buildLetterEmail({
    employeeName:       `${employee.firstName} ${employee.lastName}`,
    letterName,
    portalLink,
    requiresAcceptance: letter.requiresAcceptance ?? true,
    companyName,
    designation:     employee.designation_id?.name ?? '',
    signatoryName:   letter.template_id?.signatoryName ?? '',
    signatoryTitle:  letter.template_id?.signatoryTitle ?? '',
    signatoryEmail:  letter.template_id?.signatoryEmail ?? '',
  });

  await sendEmail({ to: toEmail, subject: `Your ${letterName} from ${companyName}`, html: emailHtml });

  await GeneratedLetter.updateOne({ _id: letterId }, { $set: { status: 'sent', sentAt: new Date() } });

  return { sent: true, to: toEmail, portalLink };
};

// ─── Accept (from pre-boarding portal) ────────────────────────────────────────
const accept = async (letterId, employeeId, signedName) => {
  const letter = await GeneratedLetter.findOne({ _id: letterId, employee_id: employeeId });
  if (!letter) throw new AppError('Letter not found.', 404);
  if (letter.status === 'accepted') throw new AppError('Already accepted.', 400);

  letter.status        = 'accepted';
  letter.acceptedByName = signedName;
  letter.acceptedAt    = new Date();
  await letter.save();
  return letter.toObject();
};

// ─── Decline (from pre-boarding portal) ───────────────────────────────────────
const decline = async (letterId, employeeId, reason) => {
  const letter = await GeneratedLetter.findOne({ _id: letterId, employee_id: employeeId });
  if (!letter) throw new AppError('Letter not found.', 404);

  letter.status      = 'declined';
  letter.declinedAt  = new Date();
  letter.declineReason = reason ?? null;
  await letter.save();
  return letter.toObject();
};

// ─── Preview (no save) ────────────────────────────────────────────────────────
const preview = async (companyId, body) => {
  const { employee_id, template_id, manualInputs = {} } = body;

  const [employee, template] = await Promise.all([
    Employee.findOne({ _id: employee_id, company_id: companyId }).lean(),
    LetterTemplate.findOne({ _id: template_id, company_id: companyId, isActive: true }).lean(),
  ]);

  if (!employee) throw new AppError('Employee not found.', 404);
  if (!template) throw new AppError('Letter template not found.', 404);

  const autoVars = await resolveVariables(companyId, employee_id);

  const allVars = { ...autoVars };
  for (const [key, val] of Object.entries(manualInputs)) {
    allVars[`manual.${key}`] = val;
    allVars[key] = val;
  }

  const bodyContent = compileContent(template.content, allVars);
  const html = _buildPrintHtml(bodyContent, template, employee, allVars);

  return { html, bodyContent };
};

// ─── Build preview from custom body content ────────────────────────────────────
const buildPreview = async (companyId, body) => {
  const { employee_id, template_id, manualInputs = {}, bodyContent } = body;

  const [employee, template] = await Promise.all([
    Employee.findOne({ _id: employee_id, company_id: companyId }).lean(),
    LetterTemplate.findOne({ _id: template_id, company_id: companyId, isActive: true }).lean(),
  ]);

  if (!employee || !template) throw new AppError('Not found.', 404);

  const autoVars = await resolveVariables(companyId, employee_id);
  const allVars = { ...autoVars };
  for (const [key, val] of Object.entries(manualInputs)) {
    allVars[`manual.${key}`] = val;
    allVars[key] = val;
  }

  const html = _buildPrintHtml(bodyContent, template, employee, allVars);
  return { html };
};

// ─── Update draft ──────────────────────────────────────────────────────────────
const updateDraft = async (companyId, id, { resolvedContent, bodyContent, employee_id, template_id, manualInputs } = {}) => {
  const letter = await GeneratedLetter.findOne({ _id: id, company_id: companyId, status: 'draft' });
  if (!letter) throw new AppError('Draft letter not found.', 404);

  if (bodyContent && employee_id && template_id) {
    const [employee, template] = await Promise.all([
      Employee.findOne({ _id: employee_id, company_id: companyId }).lean(),
      LetterTemplate.findOne({ _id: template_id, company_id: companyId, isActive: true }).lean(),
    ]);
    if (employee && template) {
      const autoVars = await resolveVariables(companyId, employee_id);
      const allVars = { ...autoVars };
      for (const [key, val] of Object.entries(manualInputs ?? {})) {
        allVars[`manual.${key}`] = val;
        allVars[key] = val;
      }
      letter.resolvedContent = _buildPrintHtml(bodyContent, template, employee, allVars);
    }
  } else if (resolvedContent) {
    letter.resolvedContent = resolvedContent;
  }

  await letter.save();
  return letter.toObject();
};

const remove = async (companyId, id) => {
  const letter = await GeneratedLetter.findOne({ _id: id, company_id: companyId });
  if (!letter) throw new AppError('Letter not found.', 404);
  await letter.deleteOne();
};

// ─── Print HTML builder (multi-page with repeating header/footer) ──────────────
const _buildPrintHtml = (content, template, employee, vars) => {
  const CSS = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 13px; color: #111; background: #fff; }
    .page { width: 210mm; min-height: 297mm; padding: 18mm 18mm 18mm 18mm; margin: 0 auto; page-break-after: always; }
    .page:last-child { page-break-after: auto; }
    .ltr-header { margin-bottom: 20px; }
    .ltr-footer { margin-top: auto; padding-top: 12px; }
    .body { line-height: 1.75; }
    .body h1 { font-size: 16px; margin: 16px 0 10px; }
    .body h2 { font-size: 15px; margin: 16px 0 10px; }
    .body h3 { font-size: 14px; margin: 14px 0 8px; }
    .body p  { margin-bottom: 10px; }
    .body ul, .body ol { margin: 8px 0 10px 22px; }
    .body li { margin-bottom: 4px; }
    .body table { width: 100%; border-collapse: collapse; margin: 14px 0; }
    .body table th, .body table td { border: 1px solid #ccc; padding: 7px 10px; text-align: left; font-size: 12px; }
    .body table th { background: #f5f5f5; font-weight: bold; }
    @media print {
      .page { margin: 0; padding: 12mm 14mm; }
      @page { margin: 0; }
    }
  `;

  // Default header/footer if template doesn't define custom ones
  const logoHtml = vars['company.logo']
    ? `<img src="${vars['company.logo']}" alt="${vars['company.name']}" style="height:52px;max-width:180px;object-fit:contain;" />`
    : `<strong style="font-size:18px;color:#dc2626;font-style:italic;">${vars['company.name'] || ''}</strong>`;

  const defaultHeader = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #dc2626;padding-bottom:10px;">
      <div>${logoHtml}</div>
      <div style="text-align:right;font-size:11px;line-height:1.6;color:#555;">
        <strong style="font-size:13px;color:#000;">${vars['company.name'] || ''}</strong><br>
        ${vars['company.llpin'] ? `LLPIN: ${vars['company.llpin']}<br>` : ''}
        ${vars['company.gstin'] ? `GSTIN ${vars['company.gstin']}` : ''}
        ${vars['company.address'] ? `${vars['company.address']}<br>` : ''}
        ${[vars['company.city'], vars['company.state']].filter(Boolean).join(', ')}
      </div>
    </div>`;

  const defaultFooter = `
    <div style="border-top:1px solid #e5e7eb;padding-top:8px;text-align:center;font-size:10px;color:#6b7280;">
      <strong>${vars['company.name'] || ''}</strong><br>
      ${[vars['company.website'], vars['company.email'], vars['company.phone']].filter(Boolean).join(' | ')}<br>
      <em>This document is confidential and intended for authorized personnel only. Unauthorized use, distribution, or disclosure is strictly prohibited and may result in legal action.</em>
    </div>`;

  const headerHtml = compileContent(template.headerHtml || defaultHeader, vars);
  const footerHtml = compileContent(template.footerHtml || defaultFooter, vars);

  // Split content on page break markers → each chunk becomes one printed page
  const pageChunks = content.split(/<hr[^>]*data-type="page-break"[^>]*\/?>/gi);

  const pages = pageChunks.map((chunk, i) => `
    <div class="page" style="display:flex;flex-direction:column;">
      <div class="ltr-header">${headerHtml}</div>
      <div class="body" style="flex:1;">${chunk}</div>
      <div class="ltr-footer">${footerHtml}</div>
    </div>`).join('\n');

  const serverBase = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 5000}`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <base href="${serverBase}">
  <style>${CSS}</style>
</head>
<body>${pages}</body>
</html>`;
};

const _buildLetterEmail = ({ employeeName, letterName, portalLink, requiresAcceptance, companyName, designation, signatoryName, signatoryTitle, signatoryEmail }) => `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.10);">

    <!-- Header -->
    <div style="background:#dc2626;padding:28px 36px;">
      <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;letter-spacing:-0.3px;">${companyName}</h1>
      <p style="color:#fca5a5;margin:6px 0 0;font-size:13px;letter-spacing:0.3px;">Official Communication</p>
    </div>

    <!-- Body -->
    <div style="padding:36px;">
      <p style="margin:0 0 6px;font-size:16px;color:#111827;">Dear <strong>${employeeName}</strong>,</p>
      ${designation ? `<p style="margin:0 0 20px;font-size:13px;color:#6b7280;">${designation}</p>` : '<p style="margin:0 0 20px;"></p>'}

      <p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.7;">
        We are pleased to share your <strong>${letterName}</strong> from <strong>${companyName}</strong>.
        ${requiresAcceptance
          ? ' Please review it carefully and complete your pre-boarding checklist through the portal.'
          : ' Please review it at your earliest convenience.'}
      </p>

      ${requiresAcceptance ? `
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#991b1b;">What to do on the portal:</p>
        <ul style="margin:0;padding-left:18px;font-size:13px;color:#374151;line-height:1.9;">
          <li>Review and sign your offer letter</li>
          <li>Fill in your personal details</li>
          <li>Upload required documents</li>
          <li>Acknowledge company policies</li>
        </ul>
      </div>` : ''}

      <div style="text-align:center;margin:28px 0;">
        <a href="${portalLink}"
          style="background:#dc2626;color:#ffffff;padding:14px 36px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block;letter-spacing:0.2px;">
          ${requiresAcceptance ? 'Open Pre-Boarding Portal →' : 'View Your Letter →'}
        </a>
      </div>

      <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;text-align:center;">
        🔒 This secure link expires in 7 days.
      </p>
    </div>

    <!-- Signatory -->
    <div style="border-top:1px solid #e5e7eb;padding:24px 36px;background:#f9fafb;">
      <p style="margin:0 0 2px;font-size:13px;font-weight:700;color:#111827;">${signatoryName || companyName}</p>
      ${signatoryTitle ? `<p style="margin:0 0 2px;font-size:12px;color:#6b7280;">${signatoryTitle}</p>` : ''}
      ${signatoryEmail ? `<p style="margin:0;font-size:12px;color:#2563eb;">${signatoryEmail}</p>` : ''}
    </div>

    <!-- Footer -->
    <div style="background:#f3f4f6;padding:14px 36px;text-align:center;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb;">
      ${companyName} &nbsp;·&nbsp; This is an official communication. If you did not expect this email, please ignore it.
    </div>
  </div>
</body>
</html>`;

module.exports = { list, getOne, generate, preview, buildPreview, updateDraft, send, accept, decline, remove };
