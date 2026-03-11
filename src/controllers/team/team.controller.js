const catchAsync      = require('../../utils/catchAsync');
const { sendSuccess } = require('../../utils/response');
const svc             = require('../../services/team/team.service');

const listTeams = catchAsync(async (req, res) => {
  const filters = {};
  if (req.query.department_id) filters.department_id = req.query.department_id;
  const teams = await svc.listTeams(req.user.companyId, filters);
  sendSuccess(res, { data: { teams } });
});

const getTeam = catchAsync(async (req, res) => {
  const team = await svc.getTeam(req.user.companyId, req.params.id);
  sendSuccess(res, { data: { team } });
});

const createTeam = catchAsync(async (req, res) => {
  const team = await svc.createTeam(req.user.companyId, req.body);
  sendSuccess(res, { status: 201, message: 'Team created.', data: { team } });
});

const updateTeam = catchAsync(async (req, res) => {
  const team = await svc.updateTeam(req.user.companyId, req.params.id, req.body);
  sendSuccess(res, { message: 'Team updated.', data: { team } });
});

const deleteTeam = catchAsync(async (req, res) => {
  await svc.deleteTeam(req.user.companyId, req.params.id);
  sendSuccess(res, { message: 'Team deleted.' });
});

module.exports = { listTeams, getTeam, createTeam, updateTeam, deleteTeam };
