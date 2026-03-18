const Employee              = require('../../models/Employee');
const UserRole              = require('../../models/UserRole');
const EmployeeSalary        = require('../../models/EmployeeSalary');
const DocumentType          = require('../../models/DocumentType');
const EmployeeDocument      = require('../../models/EmployeeDocument');
const PolicyDocument        = require('../../models/PolicyDocument');
const PolicyAcknowledgement = require('../../models/PolicyAcknowledgement');
const PayrollRecord         = require('../../models/PayrollRecord');
const PayrollRun            = require('../../models/PayrollRun');
const AppError              = require('../../utils/AppError');

// ─── Onboarding ────────────────────────────────────────────────────────────────

const getOnboardingList = async (companyId, query = {}) => {
  const { showAll } = query;
  const filter = {
    company_id: companyId,
    status: 'active',
    onboardingCompleted: { $ne: true },
  };

  // By default only show employees who joined in the last 90 days
  if (!showAll) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    filter.joiningDate = { $gte: cutoff };
  }

  const employees = await Employee.find(filter)
    .populate('department_id', 'name')
    .populate('designation_id', 'name')
    .select('firstName lastName employeeId avatar joiningDate department_id designation_id user_id leaveTemplate_id status')
    .sort({ joiningDate: -1 })
    .lean({ virtuals: true });

  if (!employees.length) return { employees: [], summary: { total: 0, complete: 0, incomplete: 0 } };

  const empIds  = employees.map((e) => e._id);
  const userIds = employees.filter((e) => e.user_id).map((e) => e.user_id);

  // Batch fetch all related data in parallel
  const [
    userRoles,
    activeSalaries,
    requiredDocTypes,
    verifiedDocs,
    requiredPolicies,
    acknowledgements,
  ] = await Promise.all([
    UserRole.find({ user_id: { $in: userIds }, company_id: companyId }).select('user_id').lean(),
    EmployeeSalary.find({ employee_id: { $in: empIds }, company_id: companyId, status: 'active' }).select('employee_id').lean(),
    DocumentType.find({ company_id: companyId, isRequired: true, isActive: true }).select('_id').lean(),
    EmployeeDocument.find({ employee_id: { $in: empIds }, company_id: companyId, status: 'verified' }).select('employee_id document_type_id').lean(),
    PolicyDocument.find({ company_id: companyId, requiresAcknowledgement: true, isLatest: true, isActive: true }).select('_id').lean(),
    PolicyAcknowledgement.find({ employee_id: { $in: empIds }, company_id: companyId }).select('employee_id policy_document_id').lean(),
  ]);

  // Build lookup sets
  const roleUserSet    = new Set(userRoles.map((r) => r.user_id.toString()));
  const salaryEmpSet   = new Set(activeSalaries.map((s) => s.employee_id.toString()));
  const requiredDocIds = requiredDocTypes.map((d) => d._id.toString());
  const requiredPolicyIds = requiredPolicies.map((p) => p._id.toString());

  // Per-employee verified docs map: empId -> Set of verified docTypeIds
  const verifiedDocsMap = {};
  for (const doc of verifiedDocs) {
    const eid = doc.employee_id.toString();
    if (!verifiedDocsMap[eid]) verifiedDocsMap[eid] = new Set();
    verifiedDocsMap[eid].add(doc.document_type_id.toString());
  }

  // Per-employee acknowledgements map: empId -> Set of policyIds
  const ackMap = {};
  for (const ack of acknowledgements) {
    const eid = ack.employee_id.toString();
    if (!ackMap[eid]) ackMap[eid] = new Set();
    ackMap[eid].add(ack.policy_document_id.toString());
  }

  // Resolve checklist per employee
  const result = employees.map((emp) => {
    const eid = emp._id.toString();

    // Role assigned (null = N/A if no portal access)
    const roleAssigned = emp.user_id
      ? roleUserSet.has(emp.user_id.toString())
      : null;

    const leaveTemplateAssigned = !!emp.leaveTemplate_id;
    const salaryAssigned        = salaryEmpSet.has(eid);

    // Documents
    const empVerifiedDocs = verifiedDocsMap[eid] || new Set();
    const documentsVerified = requiredDocIds.filter((id) => empVerifiedDocs.has(id)).length;
    const documentsRequired = requiredDocIds.length;
    const documentsComplete = documentsRequired > 0 ? documentsVerified >= documentsRequired : true;

    // Policies
    const empAcks = ackMap[eid] || new Set();
    const policiesAcked    = requiredPolicyIds.filter((id) => empAcks.has(id)).length;
    const policiesRequired = requiredPolicyIds.length;
    const policiesAcknowledged = policiesRequired > 0 ? policiesAcked >= policiesRequired : true;

    // Progress
    const items = [];
    if (roleAssigned !== null) items.push(roleAssigned);
    items.push(leaveTemplateAssigned, salaryAssigned, documentsComplete, policiesAcknowledged);
    const completed = items.filter(Boolean).length;
    const progress  = Math.round((completed / items.length) * 100);

    return {
      employee: emp,
      checklist: {
        roleAssigned,
        leaveTemplateAssigned,
        salaryAssigned,
        documentsComplete,
        documentsVerified,
        documentsRequired,
        policiesAcknowledged,
        policiesAcked,
        policiesRequired,
      },
      progress,
    };
  });

  const complete   = result.filter((r) => r.progress === 100).length;

  return {
    employees: result,
    summary: { total: result.length, complete, incomplete: result.length - complete },
  };
};

const completeOnboarding = async (companyId, employeeId) => {
  const employee = await Employee.findOne({ _id: employeeId, company_id: companyId });
  if (!employee) throw new AppError('Employee not found.', 404);
  if (employee.onboardingCompleted) throw new AppError('Onboarding already completed.', 400);

  employee.onboardingCompleted   = true;
  employee.onboardingCompletedAt = new Date();
  await employee.save();

  return employee;
};

// ─── Offboarding ───────────────────────────────────────────────────────────────

const getOffboardingList = async (companyId) => {
  const employees = await Employee.find({ company_id: companyId, status: 'notice' })
    .populate('department_id', 'name')
    .populate('designation_id', 'name')
    .select('firstName lastName employeeId avatar lastWorkingDay department_id designation_id knowledgeTransfer assetsReturned exitInterview accessRevoked user_id')
    .sort({ lastWorkingDay: 1 })
    .lean({ virtuals: true });

  if (!employees.length) return { employees: [], summary: { total: 0, complete: 0, incomplete: 0 } };

  const empIds = employees.map((e) => e._id);

  // Check experience letter uploaded
  const expLetterType = await DocumentType.findOne({
    company_id: companyId,
    slug: 'experience-letter',
    isActive: true,
  }).lean();

  let expLetterDocs = [];
  if (expLetterType) {
    expLetterDocs = await EmployeeDocument.find({
      employee_id: { $in: empIds },
      company_id: companyId,
      document_type_id: expLetterType._id,
      status: 'verified',
    }).select('employee_id').lean();
  }
  const expLetterSet = new Set(expLetterDocs.map((d) => d.employee_id.toString()));

  // Check final payroll settled
  const paidRuns = await PayrollRun.find({ company_id: companyId, status: 'paid' }).select('_id').lean();
  const paidRunIds = paidRuns.map((r) => r._id);

  let paidRecords = [];
  if (paidRunIds.length) {
    paidRecords = await PayrollRecord.find({
      employee_id: { $in: empIds },
      payrollRun_id: { $in: paidRunIds },
    }).select('employee_id').lean();
  }
  const paidEmpSet = new Set(paidRecords.map((r) => r.employee_id.toString()));

  const result = employees.map((emp) => {
    const eid = emp._id.toString();

    const checklist = {
      statusChanged:            true,
      lastWorkingDaySet:        !!emp.lastWorkingDay,
      experienceLetterUploaded: expLetterType ? expLetterSet.has(eid) : null,
      finalPayrollSettled:      paidEmpSet.has(eid),
      knowledgeTransfer:        emp.knowledgeTransfer,
      assetsReturned:           emp.assetsReturned,
      exitInterview:            emp.exitInterview,
      accessRevoked:            emp.accessRevoked,
    };

    // Progress
    const items = [
      checklist.statusChanged,
      checklist.lastWorkingDaySet,
      checklist.knowledgeTransfer,
      checklist.assetsReturned,
      checklist.exitInterview,
      checklist.accessRevoked,
      checklist.finalPayrollSettled,
    ];
    if (checklist.experienceLetterUploaded !== null) items.push(checklist.experienceLetterUploaded);

    const completed = items.filter(Boolean).length;
    const progress  = Math.round((completed / items.length) * 100);

    return { employee: emp, checklist, progress };
  });

  const complete = result.filter((r) => r.progress === 100).length;

  return {
    employees: result,
    summary: { total: result.length, complete, incomplete: result.length - complete },
  };
};

const updateOffboardingChecklist = async (companyId, employeeId, updates) => {
  const allowed = ['knowledgeTransfer', 'assetsReturned', 'exitInterview', 'accessRevoked', 'lastWorkingDay'];
  const sanitized = {};
  for (const key of allowed) {
    if (updates[key] !== undefined) sanitized[key] = updates[key];
  }

  if (!Object.keys(sanitized).length) throw new AppError('No valid fields to update.', 400);

  const employee = await Employee.findOneAndUpdate(
    { _id: employeeId, company_id: companyId, status: 'notice' },
    { $set: sanitized },
    { new: true }
  );

  if (!employee) throw new AppError('Employee not found or not in notice status.', 404);
  return employee;
};

const completeOffboarding = async (companyId, employeeId) => {
  const employee = await Employee.findOne({ _id: employeeId, company_id: companyId, status: 'notice' });
  if (!employee) throw new AppError('Employee not found or not in notice status.', 404);

  employee.status                = 'terminated';
  employee.offboardingCompletedAt = new Date();
  employee.accessRevoked          = true;
  await employee.save();

  return employee;
};

module.exports = {
  getOnboardingList,
  completeOnboarding,
  getOffboardingList,
  updateOffboardingChecklist,
  completeOffboarding,
};
