const Notification = require('../models/Notification');

const getDefaultAudience = (type) => {
  if (type === 'booking') return 'expert';
  if (type === 'meeting_started') return 'student';
  return 'both';
};

const createNotification = async ({ userId, type, title, message, data, audience }) => {
  if (!userId) return null;

  return Notification.create({
    user: userId,
    type: type || 'system',
    title,
    message,
    data: data || {},
    audience: audience || getDefaultAudience(type)
  });
};

module.exports = { createNotification };
