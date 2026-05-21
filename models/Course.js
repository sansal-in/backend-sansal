const mongoose = require("mongoose");

const roadmapItemSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    order: { type: Number, default: 0 },
    duration: { type: String, default: "" },
  },
  { _id: false },
);

const sessionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    scheduledAt: { type: Date, default: null },
    durationMinutes: { type: Number, default: 60 },
    mode: {
      type: String,
      enum: ["live", "recorded", "assignment"],
      default: "live",
    },
    meetingLink: { type: String, default: "" },
  },
  { _id: false },
);

const lessonResourceSchema = new mongoose.Schema(
  {
    label: { type: String, default: "", trim: true },
    url: { type: String, default: "", trim: true },
  },
  { _id: false },
);

const quizQuestionSchema = new mongoose.Schema(
  {
    question: { type: String, required: true, trim: true },
    options: [{ type: String, trim: true }],
    answer: { type: String, default: "", trim: true },
  },
  { _id: false },
);

const lessonSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ["video", "document", "quiz", "assignment", "live"],
      default: "video",
    },
    description: { type: String, default: "" },
    durationMinutes: { type: Number, default: 30 },
    contentUrl: { type: String, default: "" },
    meetingLink: { type: String, default: "" },
    resources: { type: [lessonResourceSchema], default: [] },
    quiz: {
      questions: { type: [quizQuestionSchema], default: [] },
    },
    assignment: {
      prompt: { type: String, default: "" },
      dueDate: { type: Date, default: null },
    },
  },
  { _id: false },
);

const faqSchema = new mongoose.Schema(
  {
    question: { type: String, required: true, trim: true },
    answer: { type: String, default: "", trim: true },
  },
  { _id: false },
);

const moduleSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    topics: [{ type: String, trim: true }],
  },
  { _id: false },
);

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, trim: true, uppercase: true },
    type: { type: String, enum: ["percent", "flat"], default: "percent" },
    value: { type: Number, default: 0, min: 0 },
    active: { type: Boolean, default: true },
    expiresAt: { type: Date, default: null },
  },
  { _id: false },
);

const courseSchema = new mongoose.Schema(
  {
    expertId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Expert",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    subtitle: {
      type: String,
      default: "",
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    price: {
      type: Number,
      default: 0,
      min: 0,
    },
    currency: {
      type: String,
      default: "INR",
    },
    category: {
      type: String,
      default: "",
    },
    level: {
      type: String,
      enum: ["beginner", "intermediate", "advanced", "all"],
      default: "all",
    },
    mode: {
      type: String,
      enum: ["live", "recorded", "live+recorded"],
      default: "recorded",
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    thumbnail: {
      type: String,
      default: "",
    },
    language: {
      type: String,
      default: "English",
    },
    previewVideoUrl: {
      type: String,
      default: "",
    },
    totalLectures: {
      type: Number,
      default: 0,
    },
    liveLectures: {
      type: Number,
      default: 0,
    },
    recordedLectures: {
      type: Number,
      default: 0,
    },
    doubtClasses: {
      type: Number,
      default: 0,
    },
    recordingProvided: {
      type: Boolean,
      default: true,
    },
    courseValidity: {
      type: String,
      default: "",
    },
    classStartDate: {
      type: Date,
      default: null,
    },
    classSchedule: [
      {
        type: String,
        trim: true,
      },
    ],
    classTime: {
      type: String,
      default: "",
    },
    highlights: [
      {
        type: String,
        trim: true,
      },
    ],
    includes: [
      {
        type: String,
        trim: true,
      },
    ],
    topics: [
      {
        type: String,
        trim: true,
      },
    ],
    roadmap: {
      type: [roadmapItemSchema],
      default: [],
    },
    sessions: {
      type: [sessionSchema],
      default: [],
    },
    lessons: {
      type: [lessonSchema],
      default: [],
    },
    modules: {
      type: [moduleSchema],
      default: [],
    },
    faqs: {
      type: [faqSchema],
      default: [],
    },
    coupons: {
      type: [couponSchema],
      default: [],
    },
    freeInterview: {
      type: Boolean,
      default: false,
    },
    resourcesIncluded: {
      type: Boolean,
      default: true,
    },
    maxSeats: {
      type: Number,
      default: null,
    },
    enrolledCount: {
      type: Number,
      default: 0,
    },
    ratingAverage: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    ratingCount: {
      type: Number,
      default: 0,
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // NEW FIELDS
    learningOutcomes: [
      {
        type: String,
        trim: true,
      },
    ],
    prerequisites: [
      {
        type: String,
        trim: true,
      },
    ],
    targetAudience: [
      {
        type: String,
        trim: true,
      },
    ],
    estimatedCompletionHours: {
      type: Number,
      default: 0,
      min: 0,
    },
    welcomeMessage: {
      type: String,
      default: "",
    },
    congratulationMessage: {
      type: String,
      default: "",
    },
    certificateTemplate: {
      type: String,
      default: "default",
    },
    discussionEnabled: {
      type: Boolean,
      default: true,
    },
    reviewsEnabled: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

courseSchema.index({ isPublished: 1, isActive: 1 });
courseSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Course", courseSchema);
