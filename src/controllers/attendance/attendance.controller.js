const catchAsync     = require('../../utils/catchAsync');
const { sendSuccess } = require('../../utils/response');
const service        = require('../../services/attendance/attendance.service');

const clockIn = catchAsync(async (req, res) => {
  const result = await service.clockIn(req.user.companyId, req.user.userId, req.body);
  sendSuccess(res, { status: 201, message: 'Clocked in successfully.', data: result });
});

const clockOut = catchAsync(async (req, res) => {
  const record = await service.clockOut(req.user.companyId, req.user.userId, req.body);
  sendSuccess(res, { message: 'Clocked out successfully.', data: { record } });
});

const getToday = catchAsync(async (req, res) => {
  const record = await service.getToday(req.user.companyId, req.user.userId);
  sendSuccess(res, { data: { record } });
});

const getMyAttendance = catchAsync(async (req, res) => {
  const result = await service.getMyAttendance(req.user.companyId, req.user.userId, req.query);
  sendSuccess(res, { data: result });
});

const listAttendance = catchAsync(async (req, res) => {
  const result = await service.listAttendance(
    req.user.companyId,
    req.query,
    req.permissionScope,
    req.user.userId,
  );
  sendSuccess(res, { data: result });
});

const getMonthlySummary = catchAsync(async (req, res) => {
  const result = await service.getMonthlySummary(
    req.user.companyId,
    req.params.employeeId,
    req.query,
  );
  sendSuccess(res, { data: result });
});

const override = catchAsync(async (req, res) => {
  const record = await service.overrideAttendance(
    req.user.companyId,
    req.params.id,
    req.user.userId,
    req.body,
  );
  sendSuccess(res, { message: 'Attendance overridden.', data: { record } });
});

const detectLocation = catchAsync(async (req, res) => {
  const result = await service.detectLocation(
    req.user.companyId,
    req.user.userId,
    Number(req.query.lat),
    Number(req.query.lng),
  );
  sendSuccess(res, { data: result });
});

module.exports = { clockIn, clockOut, getToday, getMyAttendance, listAttendance, getMonthlySummary, override, detectLocation };
