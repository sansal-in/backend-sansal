const mongoose = require('mongoose');

const courseQuestionSchema = new mongoose.Schema({
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
  question: {
    type: String,
    required: true,
    trim: true
  },
  answer: {
    type: String,
    default: '',
    trim: true
  },
  answeredAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

courseQuestionSchema.index({ createdAt: -1 });

module.exports = mongoose.model('CourseQuestion', courseQuestionSchema);
