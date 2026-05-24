const Course = require("../models/Course");
const CourseEnrollment = require("../models/CourseEnrollment");
const CourseQuestion = require("../models/CourseQuestion");
const CourseSupportTicket = require("../models/CourseSupportTicket");
const CourseLessonSubmission = require("../models/CourseLessonSubmission");
const { asyncHandler, AppError } = require("../middleware/errorMiddleware");
const { createNotification } = require("../services/notificationService");

const normalizeArray = (value) => (Array.isArray(value) ? value : []);

const generateInvoiceNumber = () => {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `INV-COURSE-${stamp}-${rand}`;
};

const applyCoupon = (course, couponCode) => {
  if (!couponCode)
    return {
      couponCode: "",
      discountAmount: 0,
      finalAmount: Number(course.price) || 0,
    };
  const normalized = String(couponCode).trim().toUpperCase();
  const coupons = Array.isArray(course.coupons) ? course.coupons : [];
  const coupon = coupons.find(
    (c) => c.code === normalized && c.active !== false,
  );
  if (!coupon) {
    return {
      couponCode: normalized,
      discountAmount: 0,
      finalAmount: Number(course.price) || 0,
      invalid: true,
    };
  }
  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
    return {
      couponCode: normalized,
      discountAmount: 0,
      finalAmount: Number(course.price) || 0,
      invalid: true,
    };
  }
  const price = Number(course.price) || 0;
  let discount = 0;
  if (coupon.type === "flat") {
    discount = Math.min(price, Number(coupon.value) || 0);
  } else {
    const percent = Math.min(100, Math.max(0, Number(coupon.value) || 0));
    discount = Math.round(price * (percent / 100));
  }
  return {
    couponCode: normalized,
    discountAmount: discount,
    finalAmount: Math.max(0, price - discount),
    invalid: false,
  };
};

const recalculateCourseRatings = async (courseId) => {
  const stats = await CourseEnrollment.aggregate([
    { $match: { courseId, rating: { $gt: 0 } } },
    {
      $group: {
        _id: "$courseId",
        avgRating: { $avg: "$rating" },
        count: { $sum: 1 },
      },
    },
  ]);
  const ratingAverage = stats[0]?.avgRating
    ? Number(stats[0].avgRating.toFixed(2))
    : 0;
  const ratingCount = stats[0]?.count || 0;
  await Course.findByIdAndUpdate(courseId, { ratingAverage, ratingCount });
  return { ratingAverage, ratingCount };
};

// Public: list published courses
const listCourses = asyncHandler(async (req, res) => {
  const {
    expertId,
    search,
    category,
    level,
    language,
    priceMin,
    priceMax,
    ratingMin,
    sort,
  } = req.query;
  const query = {
    isPublished: true,
    isActive: true,
  };

  if (expertId) query.expertId = expertId;
  if (category) query.category = String(category).trim();
  if (level) query.level = String(level).trim();
  if (language) query.language = String(language).trim();
  if (priceMin || priceMax) {
    query.price = {};
    if (priceMin && Number.isFinite(Number(priceMin)))
      query.price.$gte = Number(priceMin);
    if (priceMax && Number.isFinite(Number(priceMax)))
      query.price.$lte = Number(priceMax);
  }
  if (ratingMin && Number.isFinite(Number(ratingMin))) {
    query.ratingAverage = { $gte: Number(ratingMin) };
  }
  if (search) {
    const regex = new RegExp(String(search), "i");
    query.$or = [{ title: regex }, { description: regex }, { category: regex }];
  }

  let sortQuery = { createdAt: -1 };
  if (sort === "price_low") sortQuery = { price: 1 };
  if (sort === "price_high") sortQuery = { price: -1 };
  if (sort === "rating") sortQuery = { ratingAverage: -1 };

  const courses = await Course.find(query)
    .populate("expertId", "name avatar title company user bio")
    .sort(sortQuery);

  res.status(200).json({
    success: true,
    courses,
  });
});

// Public: course detail (only published)
const getCourseById = asyncHandler(async (req, res) => {
  const course = await Course.findOne({
    _id: req.params.id,
    isPublished: true,
    isActive: true,
  }).populate(
    "expertId",
    "name avatar title company user bio skills languages",
  );

  if (!course) {
    throw new AppError("Course not found", 404);
  }

  res.status(200).json({
    success: true,
    course,
  });
});

// Student: enroll in course
const enrollCourse = asyncHandler(async (req, res) => {
  const { couponCode } = req.body || {};
  const course = await Course.findOne({
    _id: req.params.id,
    isPublished: true,
    isActive: true,
  });
  if (!course) {
    throw new AppError("Course not found", 404);
  }

  if (Number.isFinite(Number(course.maxSeats)) && course.maxSeats !== null) {
    if (course.enrolledCount >= course.maxSeats) {
      throw new AppError("Course is full", 400);
    }
  }

  const existing = await CourseEnrollment.findOne({
    courseId: course._id,
    userId: req.user._id,
  });
  if (existing) {
    return res.status(200).json({
      success: true,
      message: "Already enrolled",
      enrollment: existing,
    });
  }

  const {
    couponCode: appliedCode,
    discountAmount,
    finalAmount,
    invalid,
  } = applyCoupon(course, couponCode);
  const paymentMode = Number(finalAmount) > 0 ? "pending" : "free";

  const enrollment = await CourseEnrollment.create({
    courseId: course._id,
    userId: req.user._id,
    expertId: course.expertId,
    price: Number(course.price) || 0,
    currency: course.currency || "INR",
    paymentMode,
    status: "booked",
    couponCode: appliedCode || "",
    discountAmount: Number(discountAmount) || 0,
    finalAmount: Number(finalAmount) || 0,
    invoiceNumber: generateInvoiceNumber(),
  });

  course.enrolledCount = (course.enrolledCount || 0) + 1;
  await course.save();

  createNotification({
    userId: req.user._id,
    type: 'course_enrolled',
    audience: 'student',
    title: 'Course enrolled',
    message: `You're enrolled in "${course.title}". Start learning anytime from your dashboard.`,
    data: {
      courseId: course._id,
      courseTitle: course.title,
      enrollmentId: enrollment._id,
      finalAmount: enrollment.finalAmount
    }
  }).catch(err => console.error('Course enrolment notification error:', err));

  res.status(201).json({
    success: true,
    enrollment,
    couponInvalid: invalid,
  });
});

// Student: list my enrollments
const getMyEnrollments = asyncHandler(async (req, res) => {
  const enrollments = await CourseEnrollment.find({ userId: req.user._id })
    .populate("courseId")
    .populate("expertId", "name avatar title company");

  res.status(200).json({
    success: true,
    enrollments,
  });
});

// Student: update progress for a course
const updateMyCourseProgress = asyncHandler(async (req, res) => {
  const {
    progressPercent,
    lastLessonIndex,
    lastLessonTitle,
    completedLessons,
  } = req.body || {};
  const normalizedProgress = Number(progressPercent);

  if (
    !Number.isFinite(normalizedProgress) ||
    normalizedProgress < 0 ||
    normalizedProgress > 100
  ) {
    throw new AppError("Progress must be between 0 and 100", 400);
  }

  const enrollment = await CourseEnrollment.findOne({
    courseId: req.params.id,
    userId: req.user._id,
  });
  if (!enrollment) {
    throw new AppError("Enrollment not found", 404);
  }

  enrollment.progressPercent = normalizedProgress;
  if (Number.isFinite(Number(completedLessons))) {
    enrollment.completedLessons = Math.max(0, Number(completedLessons));
  }
  if (
    lastLessonIndex !== undefined &&
    Number.isFinite(Number(lastLessonIndex))
  ) {
    enrollment.lastLessonIndex = Number(lastLessonIndex);
  }
  if (lastLessonTitle !== undefined) {
    enrollment.lastLessonTitle = String(lastLessonTitle || "");
  }
  enrollment.lastActiveAt = new Date();
  enrollment.lastWatchedAt = new Date();

  if (normalizedProgress >= 100) {
    enrollment.status = "completed";
    enrollment.completedAt = enrollment.completedAt || new Date();
    if (!enrollment.certificateId) {
      enrollment.certificateId = `CERT-${Date.now().toString(36).toUpperCase()}`;
    }
  }

  await enrollment.save();

  res.status(200).json({
    success: true,
    enrollment,
  });
});

// Student: submit course review
const submitCourseReview = asyncHandler(async (req, res) => {
  const rating = Number(req.body?.rating);
  const review = String(req.body?.review || "").trim();

  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    throw new AppError("Rating must be between 1 and 5", 400);
  }

  const enrollment = await CourseEnrollment.findOne({
    courseId: req.params.id,
    userId: req.user._id,
  });
  if (!enrollment) {
    throw new AppError("Enrollment not found", 404);
  }

  enrollment.rating = rating;
  enrollment.review = review;
  await enrollment.save();

  const ratingStats = await recalculateCourseRatings(enrollment.courseId);

  res.status(200).json({
    success: true,
    enrollment,
    ratingStats,
  });
});

// Public: list course reviews
const listCourseReviews = asyncHandler(async (req, res) => {
  const reviews = await CourseEnrollment.find({
    courseId: req.params.id,
    rating: { $gt: 0 },
  })
    .populate("userId", "displayName photoURL")
    .sort({ updatedAt: -1 });

  res.status(200).json({
    success: true,
    reviews,
  });
});

// Public: list course questions
const listCourseQuestions = asyncHandler(async (req, res) => {
  const questions = await CourseQuestion.find({ courseId: req.params.id })
    .populate("userId", "displayName photoURL")
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    questions,
  });
});

// Student: ask question
const askCourseQuestion = asyncHandler(async (req, res) => {
  const question = String(req.body?.question || "").trim();
  if (!question) {
    throw new AppError("Question is required", 400);
  }

  const created = await CourseQuestion.create({
    courseId: req.params.id,
    userId: req.user._id,
    question,
  });

  res.status(201).json({
    success: true,
    question: created,
  });
});

// Expert: answer question
const answerCourseQuestion = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) {
    throw new AppError("Course not found", 404);
  }
  if (course.expertId.toString() !== req.expert._id.toString()) {
    throw new AppError("Not authorized to answer questions", 403);
  }

  const answer = String(req.body?.answer || "").trim();
  if (!answer) {
    throw new AppError("Answer is required", 400);
  }

  const question = await CourseQuestion.findOne({
    _id: req.params.questionId,
    courseId: course._id,
  });
  if (!question) {
    throw new AppError("Question not found", 404);
  }

  question.answer = answer;
  question.answeredAt = new Date();
  await question.save();

  if (question.userId) {
    createNotification({
      userId: question.userId,
      type: 'course_question_answered',
      audience: 'student',
      title: 'Your question has an answer',
      message: `An expert answered your question on "${course.title}".`,
      data: {
        courseId: course._id,
        courseTitle: course.title,
        questionId: question._id
      }
    }).catch(err => console.error('Course question notification error:', err));
  }

  res.status(200).json({
    success: true,
    question,
  });
});

// Student: create support/refund ticket
const createCourseSupportTicket = asyncHandler(async (req, res) => {
  const type = String(req.body?.type || "support");
  const subject = String(req.body?.subject || "").trim();
  const message = String(req.body?.message || "").trim();

  if (!subject || !message) {
    throw new AppError("Subject and message are required", 400);
  }

  const enrollment = await CourseEnrollment.findOne({
    courseId: req.params.id,
    userId: req.user._id,
  });
  if (!enrollment) {
    throw new AppError("Enrollment not found", 404);
  }

  const ticket = await CourseSupportTicket.create({
    courseId: req.params.id,
    userId: req.user._id,
    type: type === "refund" ? "refund" : "support",
    subject,
    message,
  });

  res.status(201).json({
    success: true,
    ticket,
  });
});

// Student: list my tickets
const listMyCourseSupportTickets = asyncHandler(async (req, res) => {
  const tickets = await CourseSupportTicket.find({ userId: req.user._id })
    .populate("courseId", "title")
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    tickets,
  });
});

// Student: submit quiz attempt
const submitLessonQuiz = asyncHandler(async (req, res) => {
  const course = await Course.findOne({ _id: req.params.id, isActive: true });
  if (!course) {
    throw new AppError("Course not found", 404);
  }

  const lessonIndex = Number(req.params.lessonIndex);
  if (!Number.isFinite(lessonIndex) || lessonIndex < 0) {
    throw new AppError("Invalid lesson index", 400);
  }
  const lesson = course.lessons?.[lessonIndex];
  if (!lesson || lesson.type !== "quiz") {
    throw new AppError("Quiz lesson not found", 404);
  }

  const answers = normalizeArray(req.body?.answers);
  const questions = lesson.quiz?.questions || [];
  let correct = 0;
  questions.forEach((q, idx) => {
    const provided = String(answers[idx] || "")
      .trim()
      .toLowerCase();
    const expected = String(q.answer || "")
      .trim()
      .toLowerCase();
    if (provided && expected && provided === expected) correct += 1;
  });
  const score = questions.length
    ? Math.round((correct / questions.length) * 100)
    : 0;

  const submission = await CourseLessonSubmission.create({
    courseId: course._id,
    userId: req.user._id,
    lessonIndex,
    lessonTitle: lesson.title || "",
    type: "quiz",
    answers,
    score,
    status: "graded",
  });

  res.status(201).json({
    success: true,
    submission,
  });
});

// Student: submit assignment
const submitLessonAssignment = asyncHandler(async (req, res) => {
  const course = await Course.findOne({ _id: req.params.id, isActive: true });
  if (!course) {
    throw new AppError("Course not found", 404);
  }

  const lessonIndex = Number(req.params.lessonIndex);
  if (!Number.isFinite(lessonIndex) || lessonIndex < 0) {
    throw new AppError("Invalid lesson index", 400);
  }
  const lesson = course.lessons?.[lessonIndex];
  if (!lesson || lesson.type !== "assignment") {
    throw new AppError("Assignment lesson not found", 404);
  }

  const answer = String(req.body?.answer || "").trim();
  const url = String(req.body?.url || "").trim();
  if (!answer && !url) {
    throw new AppError("Assignment answer is required", 400);
  }

  const submission = await CourseLessonSubmission.create({
    courseId: course._id,
    userId: req.user._id,
    lessonIndex,
    lessonTitle: lesson.title || "",
    type: "assignment",
    answers: { answer, url },
    status: "submitted",
  });

  res.status(201).json({
    success: true,
    submission,
  });
});

module.exports = {
  listCourses,
  getCourseById,
  enrollCourse,
  getMyEnrollments,
  updateMyCourseProgress,
  submitCourseReview,
  listCourseReviews,
  listCourseQuestions,
  askCourseQuestion,
  answerCourseQuestion,
  createCourseSupportTicket,
  listMyCourseSupportTickets,
  submitLessonQuiz,
  submitLessonAssignment,
};
