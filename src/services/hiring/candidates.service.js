const Employee       = require('../../models/Employee');
const HiringPipeline = require('../../models/HiringPipeline');
const Company        = require('../../models/Company');
const User           = require('../../models/User');
const UserRole       = require('../../models/UserRole');
const Role           = require('../../models/Role');
const AppError       = require('../../utils/AppError');
const { sendEmail }  = require('../../utils/email');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CANDIDATE_STATUSES = ['pre_join', 'offered', 'accepted'];

const _buildWelcomeEmail = ({ firstName, email, tempPassword, companyName, portalUrl, dashboardUrl }) => `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
    <div style="background:#dc2626;padding:28px 32px;">
      <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;">${companyName}</h1>
      <p style="color:#fca5a5;margin:6px 0 0;font-size:13px;">Welcome to the team!</p>
    </div>
    <div style="padding:32px;">
      <p style="margin:0 0 16px;color:#111;font-size:16px;">Hi <strong>${firstName}</strong>,</p>
      <p style="margin:0 0 24px;color:#374151;font-size:14px;line-height:1.6;">
        Your employee account has been activated at <strong>${companyName}</strong>. Here are your login credentials for the HRMS portal.
      </p>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:24px;">
        <table style="width:100%;font-size:13px;color:#374151;border-collapse:collapse;">
          <tr><td style="padding:6px 0;width:130px;color:#6b7280;">Login Email</td><td style="padding:6px 0;font-weight:600;font-family:monospace;">${email}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;">Temp Password</td><td style="padding:6px 0;font-weight:600;font-family:monospace;">${tempPassword}</td></tr>
        </table>
      </div>
      <p style="margin:0 0 8px;color:#374151;font-size:13px;">You can use the portal to:</p>
      <ul style="margin:0 0 24px;padding-left:20px;color:#374151;font-size:13px;line-height:2;">
        <li>View your payslips, leave balances, and attendance</li>
        <li>Upload required documents</li>
        <li>Apply for leaves</li>
      </ul>
      <p style="margin:0 0 12px;color:#374151;font-size:13px;text-align:center;">Choose how you'd like to access your account:</p>
      <div style="text-align:center;margin:0 0 24px;display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
        <a href="${portalUrl}" style="background:#f97316;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;display:inline-block;">
          Employee Portal →
        </a>
        <a href="${dashboardUrl}" style="background:#18181b;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;display:inline-block;">
          Full Dashboard →
        </a>
      </div>
      <p style="margin:0 0 0;color:#6b7280;font-size:12px;text-align:center;">Please change your password after your first login. You can switch between experiences anytime from your profile.</p>
    </div>
    <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 32px;text-align:center;font-size:12px;color:#9ca3af;">
      ${companyName} HRMS &nbsp;·&nbsp; This is an automated notification
    </div>
  </div>
</body>
</html>`;

const _generateTempPassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};

const POPULATE_CANDIDATE = [
  { path: 'designation_id',       select: 'name level' },
  { path: 'department_id',        select: 'name' },
  { path: 'location_id',          select: 'name city' },
  { path: 'workPolicy_id',        select: 'name shiftType' },
  { path: 'reportingManager_id',  select: 'firstName lastName employeeId' },
  { path: 'pipeline_id',          select: 'name steps isDefault' },
  { path: 'leaveTemplate_id',     select: 'name' },
  { path: 'assignedHr_id',        select: 'firstName lastName email' },
];

/** Replicate the employee ID generation logic from employee.service */
async function _generateEmployeeId(companyId) {
  const last = await Employee
    .findOne({ company_id: companyId, employeeId: { $ne: null } })
    .sort({ createdAt: -1 })
    .select('employeeId')
    .lean();

  if (!last?.employeeId) return 'EMP001';
  const match = last.employeeId.match(/^EMP(\d+)$/i);
  if (!match) return 'EMP001';
  return `EMP${String(parseInt(match[1], 10) + 1).padStart(3, '0')}`;
}

// ─── List ─────────────────────────────────────────────────────────────────────

const list = async (companyId, query = {}) => {
  const filter = {
    company_id: companyId,
    isActive:   true,
    status:     { $in: CANDIDATE_STATUSES },
  };

  if (query.status && CANDIDATE_STATUSES.includes(query.status)) {
    filter.status = query.status;
  }
  if (query.pipeline_id) filter.pipeline_id = query.pipeline_id;
  if (query.search) {
    const re = { $regex: query.search, $options: 'i' };
    filter.$or = [{ firstName: re }, { lastName: re }, { personalEmail: re }];
  }

  const candidates = await Employee
    .find(filter)
    .populate(POPULATE_CANDIDATE)
    .sort({ createdAt: -1 })
    .lean();

  return { candidates };
};

// ─── Create ───────────────────────────────────────────────────────────────────

const create = async (companyId, userId, body) => {
  const {
    firstName, lastName, personalEmail, phone,
    designation_id, location_id, department_id,
    joiningDate, roughGross, pipeline_id, addresses,
    noticePeriodDays, employmentType, assignedHr_id,
  } = body;

  if (!firstName || !lastName) {
    throw new AppError('First name and last name are required.', 400);
  }

  const candidate = await Employee.create({
    company_id:          companyId,
    firstName,
    lastName,
    personalEmail:       personalEmail ?? null,
    phone:               phone ?? null,
    designation_id:      designation_id ?? null,
    location_id:         location_id ?? null,
    department_id:       department_id ?? null,
    joiningDate:         joiningDate ?? null,
    roughGross:          roughGross ?? null,
    noticePeriodDays:    noticePeriodDays ?? null,
    employmentType:      employmentType ?? 'full_time',
    assignedHr_id:       assignedHr_id ?? null,
    pipelineCurrentStep: 0,
    status:              'pre_join',
    addresses:           addresses ?? [],
  });

  const populated = await Employee.findById(candidate._id)
    .populate(POPULATE_CANDIDATE)
    .lean();

  return { candidate: populated };
};

// ─── Update ───────────────────────────────────────────────────────────────────

const ALLOWED_UPDATE_FIELDS = [
  'firstName', 'lastName', 'personalEmail', 'email', 'phone',
  'gender', 'dateOfBirth',
  'designation_id', 'department_id', 'location_id', 'team_id',
  'workPolicy_id', 'reportingManager_id',
  'joiningDate', 'roughGross', 'employmentType', 'leaveTemplate_id',
  'pipeline_id', 'noticePeriodDays', 'addresses', 'assignedHr_id',
];

const update = async (companyId, id, body) => {
  const candidate = await Employee.findOne({
    _id:        id,
    company_id: companyId,
    isActive:   true,
    status:     { $in: CANDIDATE_STATUSES },
  });

  if (!candidate) throw new AppError('Candidate not found.', 404);

  for (const field of ALLOWED_UPDATE_FIELDS) {
    if (body[field] !== undefined) {
      candidate[field] = body[field] === '' ? null : body[field];
    }
  }

  await candidate.save();

  const populated = await Employee.findById(candidate._id)
    .populate(POPULATE_CANDIDATE)
    .lean();

  return { candidate: populated };
};

// ─── Advance ──────────────────────────────────────────────────────────────────

const advance = async (companyId, id, body = {}) => {
  const candidate = await Employee.findOne({
    _id:        id,
    company_id: companyId,
    isActive:   true,
    status:     { $in: CANDIDATE_STATUSES },
  });

  if (!candidate) throw new AppError('Candidate not found.', 404);

  // Apply any field updates first
  for (const field of ALLOWED_UPDATE_FIELDS) {
    if (body[field] !== undefined) {
      candidate[field] = body[field] === '' ? null : body[field];
    }
  }

  // Resolve the pipeline and validate required fields for the NEXT step
  if (candidate.pipeline_id) {
    const pipeline = await HiringPipeline.findById(candidate.pipeline_id).lean();
    if (pipeline?.steps?.length) {
      const maxStep = pipeline.steps.length - 1;
      const nextStep = Math.min(candidate.pipelineCurrentStep + 1, maxStep);
      const stepDef  = pipeline.steps.find(s => s.order === nextStep);

      // Check required fields for the next step
      if (stepDef?.requiredFields?.length) {
        const missing = [];
        for (const field of stepDef.requiredFields) {
          if (field === 'salary') {
            const hasSalary = await EmployeeSalary.exists({
              employee_id: candidate._id,
              status: 'active',
            });
            if (!hasSalary) missing.push('Salary Setup');
          } else if (!candidate[field]) {
            const labels = {
              designation_id:      'Designation',
              department_id:       'Department',
              location_id:         'Location',
              joiningDate:         'Joining Date',
              workPolicy_id:       'Work Policy',
              reportingManager_id: 'Reporting Manager',
              leaveTemplate_id:    'Leave Template',
              roughGross:          'Rough Gross Salary',
            };
            missing.push(labels[field] ?? field);
          }
        }
        if (missing.length) {
          throw new AppError(
            `Cannot advance — fill these first: ${missing.join(', ')}.`,
            422
          );
        }
      }

      if (stepDef?.setStatusTo) candidate.status = stepDef.setStatusTo;
      candidate.pipelineCurrentStep = nextStep;
    }
  } else {
    candidate.pipelineCurrentStep += 1;
  }

  await candidate.save();

  const populated = await Employee.findById(candidate._id)
    .populate(POPULATE_CANDIDATE)
    .lean();

  return { candidate: populated };
};

// ─── Activate ─────────────────────────────────────────────────────────────────

const activate = async (companyId, id, options = {}) => {
  const candidate = await Employee.findOne({
    _id:        id,
    company_id: companyId,
    isActive:   true,
    status:     { $in: CANDIDATE_STATUSES },
  });

  if (!candidate) throw new AppError('Candidate not found.', 404);

  // Apply joining date override if provided
  if (options.joiningDate) candidate.joiningDate = new Date(options.joiningDate);

  // Validate required fields for activation
  const missing = [];
  if (!candidate.firstName)      missing.push('First Name');
  if (!candidate.lastName)       missing.push('Last Name');
  if (!candidate.designation_id) missing.push('Designation');
  if (!candidate.department_id)  missing.push('Department');
  if (!candidate.joiningDate)    missing.push('Joining Date');

  if (missing.length) {
    throw new AppError(`Cannot activate — missing required fields: ${missing.join(', ')}.`, 422);
  }

  // Probation setup
  const months = Number(options.probationMonths ?? 0);
  if (months > 0) {
    const probationEndDate = new Date(candidate.joiningDate);
    probationEndDate.setMonth(probationEndDate.getMonth() + months);
    candidate.probationDays    = months * 30;
    candidate.probationEndDate = probationEndDate;
    candidate.probationStatus  = 'ongoing';
  } else {
    candidate.probationDays    = 0;
    candidate.probationEndDate = null;
    candidate.probationStatus  = 'waived';
  }

  // Generate a fresh employee ID
  const employeeId = await _generateEmployeeId(companyId);

  // Advance to last pipeline step
  let finalStep = candidate.pipelineCurrentStep;
  if (candidate.pipeline_id) {
    const pipeline = await HiringPipeline.findById(candidate.pipeline_id).lean();
    if (pipeline?.steps?.length) finalStep = pipeline.steps.length - 1;
  }

  // Set company email if provided
  if (options.email) candidate.email = options.email.toLowerCase().trim();

  candidate.employeeId          = employeeId;
  candidate.status              = 'active';
  candidate.pipelineCurrentStep = finalStep;

  await candidate.save();

  // Portal access — create a User account and assign roles
  let tempPassword = null;
  if (options.portalAccess && options.email) {
    const emailLower = options.email.toLowerCase().trim();
    const existing   = await User.findOne({ email: emailLower, company_id: companyId });
    if (existing) throw new AppError('A portal account with this email already exists.', 409);

    tempPassword = _generateTempPassword();
    const user   = await User.create({
      company_id: companyId,
      firstName:  candidate.firstName,
      lastName:   candidate.lastName,
      email:      emailLower,
      password:   tempPassword,
      status:     'active',
    });

    candidate.user_id = user._id;
    await candidate.save();

    if (options.roleIds?.length) {
      await UserRole.insertMany(
        options.roleIds.map(roleId => ({
          user_id:    user._id,
          role_id:    roleId,
          company_id: companyId,
        }))
      );
    }

    // Send welcome email with credentials
    try {
      const company     = await Company.findById(companyId).select('name').lean();
      const companyName = company?.name ?? 'Your Company';
      const dashboardUrl = `${process.env.CLIENT_URL}/dashboard`;
      const portalUrl    = `${process.env.CLIENT_URL}/portal`;
      await sendEmail({
        to:      emailLower,
        subject: `Welcome to ${companyName} — Your Account Login Details`,
        html:    _buildWelcomeEmail({
          firstName:   candidate.firstName,
          email:       emailLower,
          tempPassword,
          companyName,
          portalUrl,
          dashboardUrl,
        }),
      });
    } catch (err) {
      console.error('[Activate] Welcome email failed:', err.message);
    }
  }

  const populated = await Employee.findById(candidate._id)
    .populate(POPULATE_CANDIDATE)
    .lean();

  return { candidate: populated, tempPassword };
};

// ─── Override pre-boarding (skip doc check) ───────────────────────────────────

const overridePreboarding = async (companyId, id, userId) => {
  const candidate = await Employee.findOne({
    _id:        id,
    company_id: companyId,
    isActive:   true,
    status:     { $in: CANDIDATE_STATUSES },
  });
  if (!candidate) throw new AppError('Candidate not found.', 404);

  candidate.preboardingOverriddenAt = new Date();
  candidate.preboardingOverriddenBy = userId;
  await candidate.save();

  const populated = await Employee.findById(candidate._id)
    .populate(POPULATE_CANDIDATE)
    .lean();
  return { candidate: populated };
};

// ─── Remove ───────────────────────────────────────────────────────────────────

const remove = async (companyId, id) => {
  const candidate = await Employee.findOne({
    _id:        id,
    company_id: companyId,
    isActive:   true,
    status:     { $in: CANDIDATE_STATUSES },
  });

  if (!candidate) throw new AppError('Candidate not found.', 404);

  candidate.isActive = false;
  await candidate.save();
};

// ─── HR users for assignment dropdown ─────────────────────────────────────────
const getHrUsers = async (companyId) => {
  // Find roles in this company that are HR-related or Super Admin
  const roles = await Role.find({
    company_id: companyId,
    name: { $in: ['Super Admin', 'HR Manager', 'HR Staff'] },
  }).select('_id').lean();

  const roleIds = roles.map(r => r._id);

  const userRoles = await UserRole.find({ role_id: { $in: roleIds } })
    .distinct('user_id');

  const users = await User.find({ _id: { $in: userRoles } })
    .select('firstName lastName email')
    .lean();

  return users;
};

module.exports = { list, create, update, advance, activate, overridePreboarding, remove, getHrUsers };
