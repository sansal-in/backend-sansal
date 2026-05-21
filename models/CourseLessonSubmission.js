const mongoose = require('mongoose');

const courseLessonSubmissionSchema = new mongoose.Schema({
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
  lessonIndex: {
    type: Number,
    required: true
  },
  lessonTitle: {
    type: String,
    default: ''
  },
  type: {
    type: String,
    enum: ['quiz', 'assignment'],
    required: true
  },
  answers: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  score: {
    type: Number,
    default: null
  },
  status: {
    type: String,
    enum: ['submitted', 'graded'],
    default: 'submitted'
  },
  feedback: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

courseLessonSubmissionSchema.index({ createdAt: -1 });

module.exports = mongoose.model('CourseLessonSubmission', courseLessonSubmissionSchema);
