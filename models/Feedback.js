const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    quote: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 600,
    },
    // Where this feedback was captured from — used to surface context
    // (e.g. "after a mock interview" vs "after an expert session").
    source: {
      type: String,
      enum: [
        'interview',
        'expert-session',
        'expert-chat',
        'booking-confirmation',
        'course',
        'aptitude',
        'resume',
        'general',
      ],
      default: 'interview',
      index: true,
    },
    interviewId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Interview',
      default: null,
    },
    // Free-form pointer to whatever entity this feedback is about
    // (booking id, course enrollment id, expert id, etc.). Stored as a
    // string so we can reference any collection without per-source models.
    referenceId: {
      type: String,
      default: '',
      trim: true,
    },
    // Admin moderation gate — public endpoint only returns approved entries.
    approved: {
      type: Boolean,
      default: false,
      index: true,
    },
    approvedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

feedbackSchema.index({ approved: 1, createdAt: -1 });

module.exports = mongoose.model('Feedback', feedbackSchema);
