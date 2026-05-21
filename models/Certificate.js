const mongoose = require('mongoose');

const certificateSchema = new mongoose.Schema({
  certificateNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  enrollmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CourseEnrollment',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true,
    index: true
  },
  expertId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Expert',
    required: true
  },
  studentName: {
    type: String,
    required: true,
    trim: true
  },
  courseName: {
    type: String,
    required: true,
    trim: true
  },
  expertName: {
    type: String,
    required: true,
    trim: true
  },
  issueDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  pdfUrl: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['active', 'revoked'],
    default: 'active'
  },
  revokedAt: {
    type: Date,
    default: null
  },
  revocationReason: {
    type: String,
    default: ''
  },
  verificationHash: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

certificateSchema.index({ userId: 1, courseId: 1 });
certificateSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Certificate', certificateSchema);