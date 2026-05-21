const mongoose = require('mongoose');

const testCaseResultSchema = new mongoose.Schema(
  {
    index: { type: Number, default: 0 },
    visible: { type: Boolean, default: false },
    pass: { type: Boolean, default: false },
    error: { type: String, default: '' },
    durationMs: { type: Number, default: 0 }
  },
  { _id: false }
);

const codingSubmissionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  problemId: {
    type: String,
    required: true,
    index: true
  },
  problemTitle: { type: String, default: '' },
  problemDifficulty: { type: String, default: '' },
  language: { type: String, default: 'javascript' },
  code: { type: String, required: true },
  status: {
    type: String,
    enum: ['accepted', 'wrong', 'error', 'timeout'],
    default: 'wrong'
  },
  passedCount: { type: Number, default: 0 },
  totalCount: { type: Number, default: 0 },
  errorMessage: { type: String, default: '' },
  results: { type: [testCaseResultSchema], default: [] },
  createdAt: { type: Date, default: Date.now, index: true }
});

codingSubmissionSchema.index({ userId: 1, problemId: 1, createdAt: -1 });

module.exports = mongoose.model('CodingSubmission', codingSubmissionSchema);
