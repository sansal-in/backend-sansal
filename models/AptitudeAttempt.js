const mongoose = require('mongoose');

const aptitudeAnswerSchema = new mongoose.Schema(
  {
    question: {
      type: String,
      required: true
    },
    options: {
      type: [String],
      default: []
    },
    correctAnswer: {
      type: String,
      required: true
    },
    selectedAnswer: {
      type: String,
      default: ''
    },
    isCorrect: {
      type: Boolean,
      default: false
    }
  },
  { _id: false }
);

const aptitudeAttemptSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  datasetId: {
    type: String,
    default: ''
  },
  datasetLabel: {
    type: String,
    default: ''
  },
  totalQuestions: {
    type: Number,
    default: 0
  },
  correctCount: {
    type: Number,
    default: 0
  },
  incorrectCount: {
    type: Number,
    default: 0
  },
  unansweredCount: {
    type: Number,
    default: 0
  },
  scorePercent: {
    type: Number,
    default: 0
  },
  answers: {
    type: [aptitudeAnswerSchema],
    default: []
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('AptitudeAttempt', aptitudeAttemptSchema);
