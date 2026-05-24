const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: [
      'booking',
      'booking_paid',
      'booking_accepted',
      'booking_rejected',
      'booking_rescheduled',
      'booking_completed',
      'booking_no_show',
      'meeting_started',
      'course_enrolled',
      'course_question_answered',
      'aptitude_completed',
      'system'
    ],
    default: 'system'
  },
  audience: {
    type: String,
    enum: ['student', 'expert', 'both'],
    default: 'both'
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  data: {
    type: Object,
    default: {}
  },
  isRead: {
    type: Boolean,
    default: false,
    index: true
  },
  readAt: {
    type: Date,
    default: null
  },
  isCleared: {
    type: Boolean,
    default: false,
    index: true
  },
  clearedAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

notificationSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
