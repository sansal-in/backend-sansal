const mongoose = require('mongoose');

const courseSupportTicketSchema = new mongoose.Schema({
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['refund', 'support'],
    default: 'support'
  },
  subject: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  status: {
    type: String,
    enum: ['open', 'in_review', 'resolved', 'rejected'],
    default: 'open'
  }
}, {
  timestamps: true
});

courseSupportTicketSchema.index({ createdAt: -1 });

module.exports = mongoose.model('CourseSupportTicket', courseSupportTicketSchema);
