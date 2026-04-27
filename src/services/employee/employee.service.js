const Employee      = require('../../models/Employee');
const Company       = require('../../models/Company');
const User          = require('../../models/User');
const UserRole      = require('../../models/UserRole');
const LeaveTemplate = require('../../models/LeaveTemplate');
const LeaveBalance  = require('../../models/LeaveBalance');
const AppError      = require('../../utils/AppError');
const { calculateProRatedDays } = require('../../utils/calculateLeaveDays');
const { decryptBankDetails } = require('../../utils/encryption');

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Normalize a date to noon UTC to avoid timezone day-shift issues */
const toNoonUTC = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0));
};

// Generate next employeeId for company (EMP001, EMP002, …)
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

// Generate a readable temporary password
function _generateTempPassword() {
  const chars = 'ABCDEFGHJKMNPQRSTWXYZabcdefghjkmnpqrstwxyz23456789';
  let pwd = '';
  for (let i = 0; i < 10; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
  return pwd;
}

// Resolve scope filter — returns extra query conditions
async function _scopeFilter(companyId, scope, requestingUserId) {
  if (scope === 'global') return {};

  // Find the requesting user's employee record
  const me = await Employee
    .findOne({ company_id: companyId, user_id: requestingUserId, isActive: true })
    .select('_id team_id department_id')
    .lean();

  if (!me) return { _id: null }; // no employee record → return nothing

  if (scope === 'self')       return { _id: me._id };
  if (scope === 'team')       return me.team_id       ? { team_id: me.team_id }             : { _id: null };
  if (scope === 'department') return me.department_id ? { department_id: me.department_id } : { _id: null };

  return {};
}

// ─── List employees ────────────────────────────────────────────────────────────
const listEmployees = async (companyId, filters = {}, scope = 'global', requestingUserId) => {
  const scopeCondition = await _scopeFilter(companyId, scope, requestingUserId);

  const EMPLOYEE_STATUSES = ['active', 'inactive', 'notice', 'terminated'];
  const query = { company_id: companyId, isActive: true, ...scopeCondition };

  // Employees page never shows pre-hire candidates
  query.status = filters.status
    ? (EMPLOYEE_STATUSES.includes(filters.status) ? filters.status : { $in: EMPLOYEE_STATUSES })
    : { $in: EMPLOYEE_STATUSES };

  if (filters.department_id) query.department_id = filters.department_id;
  if (filters.location_id)   query.location_id   = filters.location_id;
  if (filters.search) {
    const re = { $regex: filters.search, $options: 'i' };
    query.$or = [
      { firstName:  re },
      { lastName:   re },
      { employeeId: re },
      { email:      re },
    ];
  }

  const page  = Math.max(1, parseInt(filters.page)  || 1);
  const limit = Math.min(100, parseInt(filters.limit) || 20);
  const skip  = (page - 1) * limit;

  const [employees, total] = await Promise.all([
    Employee.find(query)
      .populate('department_id',      'name slug')
      .populate('team_id',            'name slug')
      .populate('location_id',        'name city country')
      .populate('workPolicy_id',      'name')
      .populate('designation_id',      'name level')
      .populate('reportingManager_id','firstName lastName employeeId avatar')
      .select('-bankDetails')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean({ virtuals: true }),
    Employee.countDocuments(query),
  ]);

  return { employees, total, page, totalPages: Math.ceil(total / limit) };
};

// ─── Get single employee ───────────────────────────────────────────────────────
const getEmployee = async (companyId, id) => {
  const employee = await Employee.findOne({ _id: id, company_id: companyId, isActive: true })
    .populate('department_id',       'name slug')
    .populate('team_id',             'name slug')
    .populate('location_id',         'name city country')
    .populate('workPolicy_id',       'name shiftType')
    .populate('designation_id',      'name level')
    .populate('reportingManager_id', 'firstName lastName employeeId avatar designation_id')
    .lean({ virtuals: true });

  if (!employee) throw new AppError('Employee not found.', 404);
  if (employee.bankDetails) employee.bankDetails = decryptBankDetails(employee.bankDetails);
  return employee;
};

// ─── Create employee ───────────────────────────────────────────────────────────
const createEmployee = async (companyId, body, requestingUserId) => {
  // Auto-generate or use provided employeeId
  const employeeId = body.employeeId?.trim() || await _generateEmployeeId(companyId);

  // Check for duplicate employeeId in this company
  const exists = await Employee.findOne({ company_id: companyId, employeeId });
  if (exists) throw new AppError(`Employee ID "${employeeId}" is already taken.`, 409);

  const employeeData = {
    company_id:    companyId,
    employeeId,
    firstName:     body.firstName,
    lastName:      body.lastName,
    email:         body.email         || null,
    phone:         body.phone         || null,
    dateOfBirth:   toNoonUTC(body.dateOfBirth),
    gender:        body.gender        || null,
    addresses:     body.addresses     || [],
    emergencyContact: body.emergencyContact || {},
    joiningDate:   body.joiningDate,
    employmentType: body.employmentType || 'full_time',
    department_id:  body.department_id  || null,
    team_id:        body.team_id        || null,
    location_id:    body.location_id    || null,
    workPolicy_id:  body.workPolicy_id  || null,
    workMode:       body.workMode       || 'office',
    reportingManager_id: body.reportingManager_id || null,
    designation_id: body.designation_id || null,
    status:         'active',
  };

  // ── Leave template ──
  if (body.leaveTemplate_id) {
    employeeData.leaveTemplate_id = body.leaveTemplate_id;
  }

  // ── Probation auto-calculation ──
  const company = await Company.findById(companyId).select('settings').lean();
  const probDays = body.probationDays != null ? Number(body.probationDays) : (company?.settings?.defaultProbationDays ?? 90);

  employeeData.probationDays = probDays;

  if (probDays > 0 && body.joiningDate) {
    const end = new Date(body.joiningDate);
    end.setDate(end.getDate() + probDays);
    employeeData.probationEndDate = end;
    // Auto-confirm if probation period already elapsed (old joining date)
    employeeData.probationStatus = end <= new Date() ? 'confirmed' : 'ongoing';
  } else {
    employeeData.probationStatus = probDays === 0 ? 'waived' : 'ongoing';
  }

  const employee = await Employee.create(employeeData);

  // ── Auto-create leave balances from template ──
  if (employeeData.leaveTemplate_id) {
    const template = await LeaveTemplate.findOne({
      _id: employeeData.leaveTemplate_id,
      company_id: companyId,
    }).populate('leaveTypes.leaveType_id').lean();

    if (template) {
      const fiscalStart = company?.settings?.fiscalYearStart ?? 1;
      const proRate     = company?.settings?.leave?.proRateNewJoiners ?? true;
      const proMethod   = company?.settings?.leave?.proRateMethod ?? 'monthly';
      const year        = new Date().getFullYear();
      const balanceOps  = [];

      // Determine current fiscal year boundaries
      const now       = new Date();
      const nowMonth  = now.getMonth() + 1;
      const fiscalYearBegin = new Date(
        nowMonth >= fiscalStart ? now.getFullYear() : now.getFullYear() - 1,
        fiscalStart - 1, 1
      );

      for (const tlt of template.leaveTypes) {
        const lt = tlt.leaveType_id;
        if (!lt || !lt.isActive) continue;

        let allocated = tlt.daysOverride ?? lt.daysPerYear;

        // Only pro-rate if the employee joins DURING the current fiscal year
        if (proRate && lt.proRateForNewJoiners && body.joiningDate) {
          const joinDate = new Date(body.joiningDate);
          if (joinDate >= fiscalYearBegin) {
            allocated = calculateProRatedDays(body.joiningDate, allocated, fiscalStart, proMethod);
          }
        }

        balanceOps.push({
          updateOne: {
            filter: { company_id: companyId, employee_id: employee._id, leaveType_id: lt._id, year },
            update: {
              $setOnInsert: {
                company_id: companyId, employee_id: employee._id, leaveType_id: lt._id, year,
                carryForward: 0, used: 0, pending: 0, adjustment: 0,
              },
              $set: { allocated },
            },
            upsert: true,
          },
        });
      }

      if (balanceOps.length) await LeaveBalance.bulkWrite(balanceOps);
    }
  }

  let tempPassword = null;

  // Step 3 — portal access
  if (body.portalAccess && body.email) {
    const existingUser = await User.findOne({ email: body.email.toLowerCase(), company_id: companyId });
    if (existingUser) throw new AppError('A portal account with this email already exists.', 409);

    tempPassword = _generateTempPassword();

    const user = await User.create({
      company_id: companyId,
      firstName:  body.firstName,
      lastName:   body.lastName,
      email:      body.email.toLowerCase(),
      password:   tempPassword,
      status:     'active',
    });

    employee.user_id = user._id;
    await employee.save();

    // Assign role if provided
    if (body.role_id) {
      await UserRole.create({
        user_id:    user._id,
        role_id:    body.role_id,
        company_id: companyId,
        assignedBy: requestingUserId,
      });
    }
  }

  const populated = await Employee.findById(employee._id)
    .populate('department_id',  'name slug')
    .populate('team_id',        'name slug')
    .populate('location_id',    'name city country')
    .populate('designation_id', 'name level')
    .lean();

  return { employee: populated, tempPassword };
};

// ─── Update employee ───────────────────────────────────────────────────────────
const updateEmployee = async (companyId, id, body) => {
  const employee = await Employee.findOne({ _id: id, company_id: companyId, isActive: true });
  if (!employee) throw new AppError('Employee not found.', 404);

  const allowed = [
    'firstName', 'lastName', 'email', 'phone', 'dateOfBirth', 'gender',
    'addresses', 'emergencyContact', 'avatar',
    'joiningDate', 'employmentType', 'department_id', 'team_id',
    'location_id', 'workPolicy_id', 'workMode', 'reportingManager_id', 'designation_id',
  ];

  for (const key of allowed) {
    if (body[key] !== undefined) {
      employee[key] = key === 'dateOfBirth' ? toNoonUTC(body[key]) : body[key];
    }
  }

  // Allow setting employeeId only if not already assigned
  if (body.employeeId && !employee.employeeId) {
    const conflict = await Employee.findOne({ company_id: companyId, employeeId: body.employeeId, _id: { $ne: id } });
    if (conflict) throw new AppError('Employee ID already in use.', 409);
    employee.employeeId = body.employeeId.trim().toUpperCase();
  }

  // addresses is an array — replace entirely if provided
  if (body.addresses) {
    employee.addresses = body.addresses;
  }
  if (body.emergencyContact) {
    employee.emergencyContact = {
      ...employee.emergencyContact.toObject?.() ?? employee.emergencyContact,
      ...body.emergencyContact,
    };
  }

  await employee.save();

  return Employee.findById(employee._id)
    .populate('department_id',       'name slug')
    .populate('team_id',             'name slug')
    .populate('location_id',         'name city country')
    .populate('workPolicy_id',       'name')
    .populate('designation_id',      'name level')
    .populate('reportingManager_id', 'firstName lastName employeeId avatar')
    .lean();
};

// ─── Change status ─────────────────────────────────────────────────────────────
const changeStatus = async (companyId, id, status) => {
  const employee = await Employee.findOne({ _id: id, company_id: companyId, isActive: true });
  if (!employee) throw new AppError('Employee not found.', 404);

  employee.status = status;
  await employee.save();
  return employee.toObject();
};

// ─── Delete (soft) ─────────────────────────────────────────────────────────────
const deleteEmployee = async (companyId, id) => {
  const employee = await Employee.findOne({ _id: id, company_id: companyId, isActive: true });
  if (!employee) throw new AppError('Employee not found.', 404);

  // Block if other employees report to this one
  const reporteeCount = await Employee.countDocuments({ reportingManager_id: id, company_id: companyId, isActive: true });
  if (reporteeCount > 0) {
    throw new AppError(
      `Cannot delete — ${reporteeCount} employee${reporteeCount > 1 ? 's report' : ' reports'} to this person. Reassign them first.`,
      400
    );
  }

  employee.isActive = false;
  await employee.save();
};

// ─── Update probation ─────────────────────────────────────────────────────────
const updateProbation = async (companyId, id, body, reviewerId) => {
  const employee = await Employee.findOne({ _id: id, company_id: companyId, isActive: true });
  if (!employee) throw new AppError('Employee not found.', 404);

  const { probationDays, probationStatus, probationExtendedBy, probationOutcomeNote } = body;

  // Initial assignment — set probationDays for employees that don't have it yet
  if (probationDays != null && employee.probationDays == null) {
    const days = Number(probationDays);
    employee.probationDays   = days;
    employee.probationStatus = days === 0 ? 'waived' : 'ongoing';
    if (days > 0 && employee.joiningDate) {
      const end = new Date(employee.joiningDate);
      end.setDate(end.getDate() + days);
      employee.probationEndDate = end;
    }
    await employee.save();
    return employee.toObject();
  }

  if (probationStatus) employee.probationStatus = probationStatus;
  if (probationOutcomeNote !== undefined) employee.probationOutcomeNote = probationOutcomeNote;

  // Recalculate end date if extended
  if (probationStatus === 'extended' && probationExtendedBy > 0) {
    employee.probationExtendedBy = probationExtendedBy;
    const baseEnd = employee.probationEndDate || new Date(employee.joiningDate);
    const newEnd = new Date(baseEnd);
    newEnd.setDate(newEnd.getDate() + probationExtendedBy);
    employee.probationEndDate = newEnd;
  }

  // Auto-fill reviewer
  if (probationStatus && probationStatus !== 'ongoing') {
    employee.probationReviewedBy = reviewerId;
    employee.probationReviewedAt = new Date();
  }

  await employee.save();
  return employee.toObject();
};

// ─── Auto-assign next employeeId if missing ────────────────────────────────────
const assignEmployeeId = async (companyId, id) => {
  const employee = await Employee.findOne({ _id: id, company_id: companyId, isActive: true });
  if (!employee) throw new AppError('Employee not found.', 404);
  if (employee.employeeId) throw new AppError('Employee ID already assigned.', 409);

  const nextId = await _generateEmployeeId(companyId);
  employee.employeeId = nextId;
  await employee.save();
  return employee.toObject();
};

// ─── Enable portal access ──────────────────────────────────────────────────────
const enablePortalAccess = async (companyId, id, requestingUserId) => {
  const employee = await Employee.findOne({ _id: id, company_id: companyId, isActive: true });
  if (!employee) throw new AppError('Employee not found.', 404);
  if (employee.user_id) throw new AppError('Portal access is already enabled.', 409);
  if (!employee.email) throw new AppError('Employee must have an email address to enable portal access.', 400);

  const existingUser = await User.findOne({ email: employee.email.toLowerCase(), company_id: companyId });
  if (existingUser) throw new AppError('A portal account with this email already exists.', 409);

  const tempPassword = _generateTempPassword();
  const user = await User.create({
    company_id: companyId,
    firstName:  employee.firstName,
    lastName:   employee.lastName,
    email:      employee.email.toLowerCase(),
    password:   tempPassword,
    status:     'active',
  });

  employee.user_id = user._id;
  await employee.save();

  return { tempPassword };
};

// ─── Get reportees ─────────────────────────────────────────────────────────────
const getReportees = async (companyId, id) => {
  return Employee.find({
    company_id:          companyId,
    reportingManager_id: id,
    isActive:            true,
  })
    .select('firstName lastName employeeId avatar designation_id department_id status')
    .populate('designation_id', 'name')
    .populate('department_id', 'name')
    .lean({ virtuals: true });
};

const verifyPersonalDetails = async (companyId, id, verifiedBy) => {
  const employee = await Employee.findOneAndUpdate(
    { _id: id, company_id: companyId },
    { $set: { personalDetailsVerifiedAt: new Date(), personalDetailsVerifiedBy: verifiedBy } },
    { new: true }
  ).lean();
  if (!employee) throw new AppError('Employee not found.', 404);
  return employee;
};

module.exports = {
  listEmployees, getEmployee, createEmployee,
  updateEmployee, changeStatus, deleteEmployee,
  updateProbation, getReportees, enablePortalAccess, assignEmployeeId,
  verifyPersonalDetails,
};
