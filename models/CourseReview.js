const mongoose = require('mongoose');

const courseReviewSchema = new mongoose.Schema({
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
  enrollmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CourseEnrollment'
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  title: {
    type: String,
    trim: true,
    default: ''
  },
  review: {
    type: String,
    required: true,
    trim: true
  },
  expertResponse: {
    type: String,
    default: ''
  },
  isResponded: {
    type: Boolean,
    default: false
  },
  respondedAt: {
    type: Date,
    default: null
  },
  isReported: {
    type: Boolean,
    default: false
  },
  reportReason: {
    type: String,
    default: ''
  },
  reportedAt: {
    type: Date,
    default: null
  },
  reportedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Expert'
  },
  isVerifiedPurchase: {
    type: Boolean,
    default: true
  },
  helpfulCount: {
    type: Number,
    default: 0
  },
  unhelpfulCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

courseReviewSchema.index({ courseId: 1, createdAt: -1 });
courseReviewSchema.index({ courseId: 1, rating: 1 });
courseReviewSchema.index({ userId: 1, courseId: 1 }, { unique: true });

module.exports = mongoose.model('CourseReview', courseReviewSchema);