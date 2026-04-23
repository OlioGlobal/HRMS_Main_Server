const catchAsync      = require('../../utils/catchAsync');
const { sendSuccess } = require('../../utils/response');
const svc             = require('../../services/employee/employee.service');

const listEmployees = catchAsync(async (req, res) => {
  const filters = {};
  if (req.query.department_id) filters.department_id = req.query.department_id;
  if (req.query.location_id)   filters.location_id   = req.query.location_id;
  if (req.query.status)        filters.status        = req.query.status;
  if (req.query.search)        filters.search        = req.query.search;
  if (req.query.page)          filters.page          = req.query.page;
  if (req.query.limit)         filters.limit         = req.query.limit;

  const result = await svc.listEmployees(
    req.user.companyId,
    filters,
    req.permissionScope,
    req.user.userId,
  );
  sendSuccess(res, { data: result });
});

const getEmployee = catchAsync(async (req, res) => {
  const employee = await svc.getEmployee(req.user.companyId, req.params.id);
  sendSuccess(res, { data: { employee } });
});

const createEmployee = catchAsync(async (req, res) => {
  const { employee, tempPassword } = await svc.createEmployee(
    req.user.companyId,
    req.body,
    req.user.userId,
  );
  sendSuccess(res, {
    status:  201,
    message: 'Employee created.',
    data:    { employee, tempPassword },
  });
});

const updateEmployee = catchAsync(async (req, res) => {
  const employee = await svc.updateEmployee(req.user.companyId, req.params.id, req.body);
  sendSuccess(res, { message: 'Employee updated.', data: { employee } });
});

const changeStatus = catchAsync(async (req, res) => {
  const employee = await svc.changeStatus(req.user.companyId, req.params.id, req.body.status);
  sendSuccess(res, { message: 'Status updated.', data: { employee } });
});

const deleteEmployee = catchAsync(async (req, res) => {
  await svc.deleteEmployee(req.user.companyId, req.params.id);
  sendSuccess(res, { message: 'Employee deleted.' });
});

const updateProbation = catchAsync(async (req, res) => {
  const employee = await svc.updateProbation(
    req.user.companyId,
    req.params.id,
    req.body,
    req.user.userId,
  );
  sendSuccess(res, { message: 'Probation updated.', data: { employee } });
});

const getReportees = catchAsync(async (req, res) => {
  const reportees = await svc.getReportees(req.user.companyId, req.params.id);
  sendSuccess(res, { data: { reportees } });
});

const enablePortalAccess = catchAsync(async (req, res) => {
  const { tempPassword } = await svc.enablePortalAccess(
    req.user.companyId,
    req.params.id,
    req.user.userId,
  );
  sendSuccess(res, { message: 'Portal access enabled.', data: { tempPassword } });
});

const assignEmployeeId = catchAsync(async (req, res) => {
  const employee = await svc.assignEmployeeId(req.user.companyId, req.params.id);
  sendSuccess(res, { message: 'Employee ID assigned.', data: { employee } });
});

const verifyPersonalDetails = catchAsync(async (req, res) => {
  const employee = await svc.verifyPersonalDetails(req.user.companyId, req.params.id, req.user.userId);
  sendSuccess(res, { message: 'Personal details verified.', data: { employee } });
});

module.exports = {
  listEmployees, getEmployee, createEmployee,
  updateEmployee, changeStatus, deleteEmployee,
  updateProbation, getReportees, enablePortalAccess, assignEmployeeId,
  verifyPersonalDetails,
};
