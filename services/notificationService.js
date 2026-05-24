const Notification = require('../models/Notification');

const EXPERT_TYPES = new Set(['booking']);
const STUDENT_TYPES = new Set([
  'booking_paid',
  'booking_accepted',
  'booking_rejected',
  'booking_rescheduled',
  'booking_completed',
  'booking_no_show',
  'meeting_started',
  'course_enrolled',
  'course_question_answered',
  'aptitude_completed'
]);

const getDefaultAudience = (type) => {
  if (EXPERT_TYPES.has(type)) return 'expert';
  if (STUDENT_TYPES.has(type)) return 'student';
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
