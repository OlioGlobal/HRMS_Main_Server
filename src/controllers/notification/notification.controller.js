const catchAsync      = require('../../utils/catchAsync');
const { sendSuccess } = require('../../utils/response');
const svc             = require('../../services/notification/notification.service');

const listNotifications = catchAsync(async (req, res) => {
  const result = await svc.listNotifications(
    req.user.userId,
    req.user.companyId,
    req.query,
  );
  sendSuccess(res, { data: result });
});

const getUnreadCount = catchAsync(async (req, res) => {
  const result = await svc.getUnreadCount(req.user.userId, req.user.companyId);
  sendSuccess(res, { data: result });
});

const markRead = catchAsync(async (req, res) => {
  const notification = await svc.markRead(req.params.id, req.user.userId);
  sendSuccess(res, { message: 'Notification marked as read.', data: { notification } });
});

const markAllRead = catchAsync(async (req, res) => {
  const result = await svc.markAllRead(req.user.userId, req.user.companyId);
  sendSuccess(res, { message: 'All notifications marked as read.', data: result });
});

const deleteNotification = catchAsync(async (req, res) => {
  await svc.deleteNotification(req.params.id, req.user.userId);
  sendSuccess(res, { message: 'Notification deleted.' });
});

module.exports = {
  listNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
  deleteNotification,
};
