const Notification = require('../../models/Notification');
const AppError     = require('../../utils/AppError');

// ─── List notifications (paginated) ─────────────────────────────────────────
const listNotifications = async (userId, companyId, query = {}) => {
  const page  = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const skip  = (page - 1) * limit;

  const filter = { user_id: userId, company_id: companyId };

  if (query.isRead === 'true')  filter.isRead = true;
  if (query.isRead === 'false') filter.isRead = false;
  // 'all' or omitted → no isRead filter

  const [notifications, total] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Notification.countDocuments(filter),
  ]);

  return {
    notifications,
    total,
    page,
    totalPages: Math.ceil(total / limit) || 1,
  };
};

// ─── Unread count ────────────────────────────────────────────────────────────
const getUnreadCount = async (userId, companyId) => {
  const count = await Notification.countDocuments({
    user_id:    userId,
    company_id: companyId,
    isRead:     false,
  });
  return { count };
};

// ─── Mark single notification as read ────────────────────────────────────────
const markRead = async (notificationId, userId) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, user_id: userId },
    { isRead: true, readAt: new Date() },
    { new: true },
  );
  if (!notification) throw new AppError('Notification not found.', 404);
  return notification;
};

// ─── Mark all notifications as read ──────────────────────────────────────────
const markAllRead = async (userId, companyId) => {
  const result = await Notification.updateMany(
    { user_id: userId, company_id: companyId, isRead: false },
    { isRead: true, readAt: new Date() },
  );
  return { modifiedCount: result.modifiedCount };
};

// ─── Delete notification ─────────────────────────────────────────────────────
const deleteNotification = async (notificationId, userId) => {
  const notification = await Notification.findOneAndDelete({
    _id:     notificationId,
    user_id: userId,
  });
  if (!notification) throw new AppError('Notification not found.', 404);
  return notification;
};

module.exports = {
  listNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
  deleteNotification,
};
