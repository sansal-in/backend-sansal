const mongoose = require('mongoose');

const courseEnrollmentSchema = new mongoose.Schema({
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
  expertId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Expert',
    required: true,
    index: true
  },
  price: {
    type: Number,
    default: 0,
    min: 0
  },
  currency: {
    type: String,
    default: 'INR'
  },
  paymentMode: {
    type: String,
    enum: ['free', 'pending'],
    default: 'free'
  },
  status: {
    type: String,
    enum: ['booked', 'cancelled', 'completed'],
    default: 'booked'
  },
  progressPercent: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  completedLessons: {
    type: Number,
    min: 0,
    default: 0
  },
  lastLessonIndex: {
    type: Number,
    default: null
  },
  lastLessonTitle: {
    type: String,
    default: ''
  },
  lastActiveAt: {
    type: Date,
    default: null
  },
  lastWatchedAt: {
    type: Date,
    default: null
  },
  completedAt: {
    type: Date,
    default: null
  },
  rating: {
    type: Number,
    min: 1,
    max: 5,
    default: null
  },
  review: {
    type: String,
    default: ''
  },
  invoiceNumber: {
    type: String,
    default: ''
  },
  couponCode: {
    type: String,
    default: ''
  },
  discountAmount: {
    type: Number,
    default: 0
  },
  finalAmount: {
    type: Number,
    default: 0
  },
  certificateId: {
    type: String,
    default: ''
  },
  notes: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

courseEnrollmentSchema.index({ courseId: 1, userId: 1 }, { unique: true });
courseEnrollmentSchema.index({ createdAt: -1 });

module.exports = mongoose.model('CourseEnrollment', courseEnrollmentSchema);
