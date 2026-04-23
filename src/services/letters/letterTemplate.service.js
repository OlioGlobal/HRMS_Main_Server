const LetterTemplate          = require('../../models/LetterTemplate');
const AppError                = require('../../utils/AppError');
const { resolveVariables, compileContent } = require('./variableResolver.service');

const list = async (companyId, query = {}) => {
  const filter = { company_id: companyId, isActive: true };
  if (query.letterType) filter.letterType = query.letterType;
  if (query.category)   filter.category   = query.category;

  return LetterTemplate.find(filter)
    .sort({ letterType: 1, isDefault: -1, updatedAt: -1 })
    .lean();
};

const getOne = async (companyId, id) => {
  const tpl = await LetterTemplate.findOne({ _id: id, company_id: companyId, isActive: true }).lean();
  if (!tpl) throw new AppError('Letter template not found.', 404);
  return tpl;
};

const create = async (companyId, userId, body) => {
  const { name, letterType, category, content, headerHtml, footerHtml, manualVariables, signatoryName, signatoryTitle, signatoryEmail, isDefault, requiresAcceptance } = body;

  // If marking as default, unset existing default for this letterType
  if (isDefault) {
    await LetterTemplate.updateMany(
      { company_id: companyId, letterType, isDefault: true },
      { $set: { isDefault: false } }
    );
  }

  const tpl = await LetterTemplate.create({
    company_id: companyId,
    name, letterType, category,
    content:         content ?? '',
    headerHtml:      headerHtml ?? '',
    footerHtml:      footerHtml ?? '',
    manualVariables: manualVariables ?? [],
    signatoryName, signatoryTitle, signatoryEmail,
    requiresAcceptance: requiresAcceptance !== undefined ? !!requiresAcceptance : true,
    isDefault:  !!isDefault,
    createdBy:  userId,
    lastEditedBy: userId,
  });

  return tpl.toObject();
};

const update = async (companyId, userId, id, body) => {
  const tpl = await LetterTemplate.findOne({ _id: id, company_id: companyId, isActive: true });
  if (!tpl) throw new AppError('Letter template not found.', 404);

  const fields = ['name', 'category', 'content', 'headerHtml', 'footerHtml', 'manualVariables', 'signatoryName', 'signatoryTitle', 'signatoryEmail', 'requiresAcceptance'];
  for (const f of fields) {
    if (body[f] !== undefined) tpl[f] = body[f];
  }

  if (body.isDefault === true) {
    await LetterTemplate.updateMany(
      { company_id: companyId, letterType: tpl.letterType, isDefault: true, _id: { $ne: id } },
      { $set: { isDefault: false } }
    );
    tpl.isDefault = true;
  } else if (body.isDefault === false) {
    tpl.isDefault = false;
  }

  tpl.version      += 1;
  tpl.lastEditedBy  = userId;
  await tpl.save();
  return tpl.toObject();
};

const remove = async (companyId, id) => {
  const tpl = await LetterTemplate.findOne({ _id: id, company_id: companyId, isActive: true });
  if (!tpl) throw new AppError('Letter template not found.', 404);
  tpl.isActive = false;
  await tpl.save();
};

const preview = async (companyId, id, employeeId) => {
  const tpl = await LetterTemplate.findOne({ _id: id, company_id: companyId, isActive: true }).lean();
  if (!tpl) throw new AppError('Letter template not found.', 404);

  let variables = {};
  if (employeeId) {
    variables = await resolveVariables(companyId, employeeId);
  } else {
    // Dummy variables for preview without employee
    variables = _dummyVariables();
  }

  const resolvedContent = compileContent(tpl.content, variables);
  return { template: tpl, resolvedContent, variables };
};

const _dummyVariables = () => ({
  'employee.name':         'Rahul Sharma',
  'employee.firstName':    'Rahul',
  'employee.lastName':     'Sharma',
  'employee.id':           'EMP001',
  'employee.designation':  'SEO Manager',
  'employee.department':   'Marketing',
  'employee.joiningDate':  '01 May 2026',
  'employee.address':      '123, MG Road, Mumbai - 400001',
  'employee.managerName':  'Suraj Shinde',
  'employee.managerEmail': 'suraj@company.com',
  'employee.probationMonths': '6',
  'employee.noticePeriodDays': '60',
  'employee.location':     'Mumbai Office',
  'employee.officeAddress':'406, Rajgor Empire, Ghatkopar (W), Mumbai – 400086',
  'company.name':          'Olio Global AdTech LLP',
  'company.llpin':         'ABB-4484',
  'company.gstin':         '27AAIFO0132H1ZJ',
  'salary.ctcMonthly':     '₹35,000',
  'salary.ctcAnnual':      '₹4,20,000',
  'salary.table':          '<table border="1" cellpadding="6" style="border-collapse:collapse"><tr><th>Component</th><th>Amount</th><th>%</th></tr><tr><td>Basic Salary</td><td>₹17,500</td><td>50%</td></tr><tr><td>HRA</td><td>₹8,750</td><td>25%</td></tr><tr><td>Other Allowance</td><td>₹8,750</td><td>25%</td></tr><tr><td><b>Total Gross</b></td><td><b>₹35,000</b></td><td>100%</td></tr></table>',
  'policy.workStart':      '10:00',
  'policy.workEnd':        '19:00',
  'policy.workingDays':    'MON, TUE, WED, THU, FRI',
  'policy.graceMinutes':   '30',
  'leave.cl':              '6',
  'leave.sl':              '7',
  'leave.al':              '15',
  'meta.today':            new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }),
  'meta.year':             new Date().getFullYear(),
});

module.exports = { list, getOne, create, update, remove, preview };
