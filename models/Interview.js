const mongoose = require('mongoose');

const interviewSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  expertId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Expert'
  },
  scheduledAt: {
    type: Date
  },
  status: {
    type: String,
    enum: ['scheduled', 'completed', 'cancelled', 'pending'],
    default: 'pending'
  },
  config: {
    role: String,
    experience: String,
    difficulty: String,
    duration: Number,
    type: {
      type: String,
      enum: ['mock', 'hr', 'technical', 'resume'],
      default: 'mock'
    },
    focusArea: String,
    resumeSummary: String
  },
  questions: Array, // Stores the list of questions asked
  answers: [{
    question: Object,
    answer: String,
    score: Number,
    timeSpent: Number,
    skipped: Boolean,
    timestamp: Date
  }],
  totalScore: Number,
  timeSpent: Number,
  completed: Boolean,
  completedAt: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Interview', interviewSchema);