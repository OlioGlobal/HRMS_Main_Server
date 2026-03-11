const catchAsync      = require('../../utils/catchAsync');
const { sendSuccess } = require('../../utils/response');
const svc             = require('../../services/location/location.service');

const listLocations = catchAsync(async (req, res) => {
  const locations = await svc.listLocations(req.user.companyId);
  sendSuccess(res, { data: { locations } });
});

const getLocation = catchAsync(async (req, res) => {
  const location = await svc.getLocation(req.user.companyId, req.params.id);
  sendSuccess(res, { data: { location } });
});

const createLocation = catchAsync(async (req, res) => {
  const location = await svc.createLocation(req.user.companyId, req.body);
  sendSuccess(res, { status: 201, message: 'Location created.', data: { location } });
});

const updateLocation = catchAsync(async (req, res) => {
  const location = await svc.updateLocation(req.user.companyId, req.params.id, req.body);
  sendSuccess(res, { message: 'Location updated.', data: { location } });
});

const deleteLocation = catchAsync(async (req, res) => {
  await svc.deleteLocation(req.user.companyId, req.params.id);
  sendSuccess(res, { message: 'Location deleted.' });
});

module.exports = { listLocations, getLocation, createLocation, updateLocation, deleteLocation };
