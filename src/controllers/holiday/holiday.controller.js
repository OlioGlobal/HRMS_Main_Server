const catchAsync     = require('../../utils/catchAsync');
const { sendSuccess } = require('../../utils/response');
const service        = require('../../services/holiday/holiday.service');

const list = catchAsync(async (req, res) => {
  const holidays = await service.listHolidays(req.user.companyId, req.query);
  sendSuccess(res, { data: { holidays } });
});

const get = catchAsync(async (req, res) => {
  const holiday = await service.getHoliday(req.user.companyId, req.params.id);
  sendSuccess(res, { data: { holiday } });
});

const create = catchAsync(async (req, res) => {
  const holiday = await service.createHoliday(req.user.companyId, req.body);
  sendSuccess(res, { status: 201, message: 'Holiday created.', data: { holiday } });
});

const bulkCreate = catchAsync(async (req, res) => {
  const holidays = await service.bulkCreateHolidays(req.user.companyId, req.body.holidays);
  sendSuccess(res, { status: 201, message: `${holidays.length} holiday(s) imported.`, data: { holidays } });
});

const update = catchAsync(async (req, res) => {
  const holiday = await service.updateHoliday(req.user.companyId, req.params.id, req.body);
  sendSuccess(res, { message: 'Holiday updated.', data: { holiday } });
});

const remove = catchAsync(async (req, res) => {
  await service.deleteHoliday(req.user.companyId, req.params.id);
  sendSuccess(res, { message: 'Holiday deleted.' });
});

const fetchNager = catchAsync(async (req, res) => {
  const { countryCode, year } = req.query;
  const holidays = await service.fetchNagerHolidays(countryCode, year || new Date().getFullYear());
  sendSuccess(res, { data: { holidays } });
});

const pickOptional = catchAsync(async (req, res) => {
  const pick = await service.pickOptionalHoliday(req.user.companyId, req.params.employeeId, req.params.holidayId);
  sendSuccess(res, { status: 201, message: 'Optional holiday picked.', data: { pick } });
});

const unpickOptional = catchAsync(async (req, res) => {
  await service.unpickOptionalHoliday(req.user.companyId, req.params.employeeId, req.params.holidayId);
  sendSuccess(res, { message: 'Optional holiday unpicked.' });
});

const getOptionalPicks = catchAsync(async (req, res) => {
  const picks = await service.getEmployeeOptionalHolidays(
    req.user.companyId,
    req.params.employeeId,
    req.query.year
  );
  sendSuccess(res, { data: { picks } });
});

module.exports = { list, get, create, bulkCreate, update, remove, fetchNager, pickOptional, unpickOptional, getOptionalPicks };
