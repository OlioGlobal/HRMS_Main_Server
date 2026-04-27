const Employee              = require('../../models/Employee');
const GeneratedLetter       = require('../../models/GeneratedLetter');
const PolicyDocument        = require('../../models/PolicyDocument');
const PolicyAcknowledgement = require('../../models/PolicyAcknowledgement');
const EmployeeDocument      = require('../../models/EmployeeDocument');
const DocumentType          = require('../../models/DocumentType');
const AppError              = require('../../utils/AppError');
const { sendEmail }         = require('../../utils/email');
const { encryptBankDetails, decryptBankDetails } = require('../../utils/encryption');

// ─── Shared branded email builder ─────────────────────────────────────────────
const _buildHrNotificationEmail = ({ companyName, hrName, candidateName, designation, joiningDate, action, details, hrmsLink }) => `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
    <div style="background:#dc2626;padding:24px 32px;">
      <h1 style="color:#fff;margin:0;font-size:20px;font-weight:700;">${companyName}</h1>
      <p style="color:#fca5a5;margin:4px 0 0;font-size:13px;">Pre-Boarding Activity</p>
    </div>
    <div style="padding:32px;">
      <p style="margin:0 0 8px;color:#111;font-size:15px;">Hi <strong>${hrName}</strong>,</p>
      <p style="margin:0 0 24px;color:#374151;font-size:14px;line-height:1.6;">${action}</p>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:24px;">
        <table style="width:100%;font-size:13px;color:#374151;border-collapse:collapse;">
          <tr><td style="padding:5px 0;width:140px;color:#6b7280;">Candidate</td><td style="padding:5px 0;font-weight:600;">${candidateName}</td></tr>
          ${designation ? `<tr><td style="padding:5px 0;color:#6b7280;">Position</td><td style="padding:5px 0;">${designation}</td></tr>` : ''}
          ${joiningDate ? `<tr><td style="padding:5px 0;color:#6b7280;">Joining Date</td><td style="padding:5px 0;">${new Date(joiningDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td></tr>` : ''}
          ${details ? `<tr><td style="padding:5px 0;color:#6b7280;">Details</td><td style="padding:5px 0;">${details}</td></tr>` : ''}
        </table>
      </div>
      ${hrmsLink ? `
      <div style="text-align:center;margin:24px 0;">
        <a href="${hrmsLink}" style="background:#dc2626;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;display:inline-block;">
          View in HRMS →
        </a>
      </div>` : ''}
    </div>
    <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 32px;text-align:center;font-size:12px;color:#9ca3af;">
      ${companyName} HRMS &nbsp;·&nbsp; This is an automated notification
    </div>
  </div>
</body>
</html>`;

// ─── Notify assigned HR ────────────────────────────────────────────────────────
const _notifyHr = async (employee, subject, action, details = '') => {
  try {
    const hr = employee.assignedHr_id;
    if (!hr?.email) return;
    const companyName = employee.company_id?.name ?? 'HR Team';
    const hrName      = hr.firstName ?? 'HR';
    const candidateName = `${employee.firstName} ${employee.lastName}`;
    const designation   = employee.designation_id?.name ?? '';
    const hrmsLink = `${process.env.CLIENT_URL}/dashboard/workforce/hiring`;
    await sendEmail({
      to: hr.email,
      subject: `[Pre-Boarding] ${subject} — ${candidateName}`,
      html: _buildHrNotificationEmail({ companyName, hrName, candidateName, designation, joiningDate: employee.joiningDate, action, details, hrmsLink }),
    });
  } catch (err) {
    console.error('[Preboarding] HR notify failed:', err.message);
  }
};

// ─── Validate token + fetch employee ──────────────────────────────────────────
const getEmployeeByToken = async (token) => {
  const employee = await Employee.findOne({
    preBoardingToken:       token,
    preBoardingTokenExpiry: { $gt: new Date() },
  })
    .populate('company_id',    'name email website phone')
    .populate('designation_id','name')
    .populate('department_id', 'name')
    .populate('location_id',   'name address city')
    .populate('assignedHr_id', 'firstName lastName email')
    .lean();

  if (!employee) throw new AppError('Invalid or expired pre-boarding link.', 401);
  if (employee.bankDetails) employee.bankDetails = decryptBankDetails(employee.bankDetails);
  return employee;
};

// ─── Get full portal checklist ─────────────────────────────────────────────────
const getChecklist = async (token) => {
  const employee = await getEmployeeByToken(token);
  const empId    = employee._id;
  const compId   = employee.company_id._id ?? employee.company_id;

  const [letters, policies, acks, docTypes, uploadedDocs] = await Promise.all([
    GeneratedLetter.find({ employee_id: empId, status: { $in: ['sent', 'accepted', 'declined'] } })
      .populate('template_id', 'name letterType')
      .sort({ createdAt: 1 })
      .lean(),
    PolicyDocument.find({ company_id: compId, requireAcknowledgement: true, isActive: true }).lean(),
    PolicyAcknowledgement.find({ employee_id: empId }).lean(),
    DocumentType.find({ company_id: compId, whoUploads: { $in: ['employee', 'both'] }, isActive: true }).lean(),
    EmployeeDocument.find({ employee_id: empId, company_id: compId, isVisibleToEmployee: true }).sort({ createdAt: -1 }).lean(),
  ]);

  const ackedPolicyIds  = new Set(acks.map(a => a.policy_id?.toString()));
  const uploadedTypeIds = new Set(uploadedDocs.map(d => d.document_type_id?.toString()));

  const letterItems = letters.map(l => ({
    _id:               l._id,
    name:              l.template_id?.name ?? l.letterType,
    letterType:        l.letterType,
    status:            l.status,
    requiresAcceptance: l.requiresAcceptance ?? true,
    acceptedAt:        l.acceptedAt,
    acceptComment:     l.acceptComment,
    declinedAt:        l.declinedAt,
    declineReason:     l.declineReason,
    resolvedContent:   l.resolvedContent,
  }));

  const policyItems = policies.map(p => ({
    _id:          p._id,
    title:        p.title,
    fileUrl:      p.fileUrl,
    acknowledged: ackedPolicyIds.has(p._id.toString()),
  }));

  const docItems = docTypes.map(dt => ({
    _id:            dt._id,
    name:           dt.name,
    isRequired:     dt.isRequired,
    allowedFormats: dt.allowedFormats,
    maxFileSizeMB:  dt.maxFileSizeMB,
    uploaded:       uploadedTypeIds.has(dt._id.toString()),
    document:       uploadedDocs.find(d => d.document_type_id?.toString() === dt._id.toString()) ?? null,
  }));

  const personalDetails = {
    filled: !!(
      employee.dateOfBirth &&
      employee.bankDetails?.accountNumber &&
      employee.emergencyContact?.name &&
      employee.addresses?.length
    ),
    fields: {
      dateOfBirth:      !!employee.dateOfBirth,
      bankDetails:      !!(employee.bankDetails?.accountNumber),
      emergencyContact: !!(employee.emergencyContact?.name),
      address:          !!(employee.addresses?.length),
    },
  };

  const actionLetters = letterItems.filter(l => l.requiresAcceptance);
  const letterTotal   = actionLetters.length;
  const letterDone    = actionLetters.filter(l => l.status === 'accepted').length;

  const totalTasks = letterTotal + policyItems.length + docItems.filter(d => d.isRequired).length + 1;
  const doneTasks  =
    letterDone +
    policyItems.filter(p => p.acknowledged).length +
    docItems.filter(d => d.isRequired && d.uploaded).length +
    (personalDetails.filled ? 1 : 0);

  const hr = employee.assignedHr_id;

  return {
    employee: {
      _id:         employee._id,
      name:        `${employee.firstName} ${employee.lastName}`,
      firstName:   employee.firstName,
      lastName:    employee.lastName,
      designation: employee.designation_id?.name ?? '',
      department:  employee.department_id?.name  ?? '',
      joiningDate: employee.joiningDate,
      location:    employee.location_id?.name    ?? '',
      company:     employee.company_id,
      // Personal fields for pre-filling the form
      phone:            employee.phone         ?? '',
      dateOfBirth:      employee.dateOfBirth   ?? null,
      gender:           employee.gender        ?? '',
      bankDetails:      employee.bankDetails   ?? {},
      emergencyContact: employee.emergencyContact ?? {},
      addresses:        employee.addresses     ?? [],
      assignedHr: hr ? { firstName: hr.firstName, lastName: hr.lastName, email: hr.email } : null,
    },
    checklist: {
      letters:        letterItems,
      policies:       policyItems,
      documents:      docItems,
      personalDetails,
    },
    progress: { total: totalTasks, done: doneTasks, percent: totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0 },
  };
};

// ─── Accept letter ─────────────────────────────────────────────────────────────
const acceptLetter = async (token, letterId, signedName, comment) => {
  const employee = await getEmployeeByToken(token);
  const letter   = await GeneratedLetter.findOne({ _id: letterId, employee_id: employee._id, requiresAcceptance: true })
    .populate('template_id', 'name');
  if (!letter) throw new AppError('Letter not found.', 404);
  if (letter.status === 'accepted') return letter.toObject();

  letter.status         = 'accepted';
  letter.acceptedByName = signedName;
  letter.acceptedAt     = new Date();
  if (comment?.trim()) letter.acceptComment = comment.trim();
  await letter.save();

  if (employee.status === 'pre_join') {
    await Employee.updateOne({ _id: employee._id }, { $set: { status: 'offered' } });
  }

  const letterName = letter.template_id?.name ?? letter.letterType;
  await _notifyHr(
    employee,
    `${letterName} Accepted`,
    `<strong>${employee.firstName} ${employee.lastName}</strong> has accepted the <strong>${letterName}</strong> and signed digitally.`,
    comment?.trim() ? `Candidate's note: "${comment.trim()}"` : ''
  );

  return letter.toObject();
};

// ─── Decline letter ────────────────────────────────────────────────────────────
const declineLetter = async (token, letterId, reason) => {
  const employee = await getEmployeeByToken(token);
  const letter   = await GeneratedLetter.findOne({ _id: letterId, employee_id: employee._id })
    .populate('template_id', 'name');
  if (!letter) throw new AppError('Letter not found.', 404);

  letter.status        = 'declined';
  letter.declinedAt    = new Date();
  letter.declineReason = reason ?? null;
  await letter.save();

  const letterName = letter.template_id?.name ?? letter.letterType;
  await _notifyHr(
    employee,
    `${letterName} Declined`,
    `<strong>${employee.firstName} ${employee.lastName}</strong> has <strong style="color:#dc2626;">declined</strong> the <strong>${letterName}</strong>.`,
    reason ? `Reason: "${reason}"` : 'No reason provided.'
  );

  return letter.toObject();
};

// ─── Acknowledge policy ────────────────────────────────────────────────────────
const acknowledgePolicy = async (token, policyId) => {
  const employee = await getEmployeeByToken(token);
  const compId   = employee.company_id._id ?? employee.company_id;

  const policy = await PolicyDocument.findOne({ _id: policyId, company_id: compId, isActive: true }).lean();
  if (!policy) throw new AppError('Policy not found.', 404);

  const existing = await PolicyAcknowledgement.findOne({ employee_id: employee._id, policy_id: policyId });
  if (existing) return existing.toObject();

  const ack = await PolicyAcknowledgement.create({
    company_id:    compId,
    employee_id:   employee._id,
    policy_id:     policyId,
    acknowledgedAt: new Date(),
    version:       policy.version ?? 1,
  });
  return ack.toObject();
};

// ─── Save personal details ─────────────────────────────────────────────────────
const savePersonalDetails = async (token, body) => {
  const employee = await getEmployeeByToken(token);
  const updates  = {};

  if (body.firstName)       updates.firstName       = body.firstName;
  if (body.lastName)        updates.lastName        = body.lastName;
  if (body.dateOfBirth)     updates.dateOfBirth     = body.dateOfBirth;
  if (body.gender)          updates.gender          = body.gender;
  if (body.phone)           updates.phone           = body.phone;
  if (body.bankDetails)     updates.bankDetails     = encryptBankDetails(body.bankDetails);
  if (body.emergencyContact)updates.emergencyContact = body.emergencyContact;
  if (body.address) {
    updates.addresses = [{ ...body.address, isPrimary: true, label: 'home' }];
  }

  const updated = await Employee.findByIdAndUpdate(employee._id, { $set: updates }, { new: true }).lean();

  await _notifyHr(
    employee,
    'Personal Details Updated',
    `<strong>${employee.firstName} ${employee.lastName}</strong> has submitted their personal details on the pre-boarding portal.`,
    'Details include: contact info, home address, emergency contact, and bank details.'
  );

  if (updated?.bankDetails) updated.bankDetails = decryptBankDetails(updated.bankDetails);
  return updated;
};

module.exports = { getEmployeeByToken, getChecklist, acceptLetter, declineLetter, acknowledgePolicy, savePersonalDetails };
