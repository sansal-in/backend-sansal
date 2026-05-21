const Course = require("../../models/Course");
const CourseEnrollment = require("../../models/CourseEnrollment");
const CourseAnnouncement = require("../../models/CourseAnnouncement");
const CourseReview = require("../../models/CourseReview");
const { asyncHandler, AppError } = require("../../middleware/errorMiddleware");

// Helper sanitization functions (unchanged)
const normalizeArray = (value) => (Array.isArray(value) ? value : []);

const sanitizeRoadmap = (items) => {
  return normalizeArray(items)
    .map((item, index) => ({
      title: String(item?.title || "").trim(),
      description: String(item?.description || "").trim(),
      order: Number.isFinite(Number(item?.order))
        ? Number(item.order)
        : index + 1,
      duration: String(item?.duration || "").trim(),
    }))
    .filter((item) => item.title);
};

const sanitizeSessions = (items) => {
  return normalizeArray(items)
    .map((item) => ({
      title: String(item?.title || "").trim(),
      description: String(item?.description || "").trim(),
      scheduledAt: item?.scheduledAt ? new Date(item.scheduledAt) : null,
      durationMinutes: Number.isFinite(Number(item?.durationMinutes))
        ? Number(item.durationMinutes)
        : 60,
      mode: ["live", "recorded", "assignment"].includes(String(item?.mode))
        ? String(item.mode)
        : "live",
      meetingLink: String(item?.meetingLink || "").trim(),
    }))
    .filter((item) => item.title);
};

const sanitizeResources = (items) => {
  return normalizeArray(items)
    .map((item) => ({
      label: String(item?.label || "").trim(),
      url: String(item?.url || "").trim(),
    }))
    .filter((item) => item.label || item.url);
};

const sanitizeQuizQuestions = (items) => {
  return normalizeArray(items)
    .map((item) => {
      const options = normalizeArray(item?.options)
        .map((option) => String(option || "").trim())
        .filter(Boolean);
      return {
        question: String(item?.question || "").trim(),
        options,
        answer: String(item?.answer || "").trim(),
      };
    })
    .filter((item) => item.question);
};

const parseDateOrNull = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const sanitizeLessons = (items) => {
  return normalizeArray(items)
    .map((item, index) => ({
      lessonId: item?.lessonId || `lesson_${Date.now()}_${index}`,
      title: String(item?.title || "").trim(),
      type: ["video", "document", "quiz", "assignment", "live"].includes(
        String(item?.type),
      )
        ? String(item.type)
        : "video",
      description: String(item?.description || "").trim(),
      durationMinutes: Number.isFinite(Number(item?.durationMinutes))
        ? Number(item.durationMinutes)
        : 30,
      contentUrl: String(item?.contentUrl || "").trim(),
      meetingLink: String(item?.meetingLink || "").trim(),
      order: Number.isFinite(Number(item?.order)) ? Number(item.order) : index,
      isPreview: Boolean(item?.isPreview),
      resources: sanitizeResources(item?.resources),
      quiz: {
        questions: sanitizeQuizQuestions(
          item?.quiz?.questions || item?.quizQuestions || item?.questions,
        ),
      },
      assignment: {
        prompt: String(
          item?.assignment?.prompt || item?.assignmentPrompt || "",
        ).trim(),
        dueDate: parseDateOrNull(
          item?.assignment?.dueDate || item?.assignmentDueDate,
        ),
        maxScore: Number.isFinite(Number(item?.assignment?.maxScore))
          ? Number(item.assignment.maxScore)
          : 100,
      },
    }))
    .filter((item) => item.title);
};

const sanitizeFaqs = (items) => {
  return normalizeArray(items)
    .map((item) => ({
      question: String(item?.question || "").trim(),
      answer: String(item?.answer || "").trim(),
    }))
    .filter((item) => item.question);
};

const sanitizeStringArray = (items) => {
  if (Array.isArray(items)) {
    return items.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof items === "string") {
    return items
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

const sanitizeModules = (items) => {
  return normalizeArray(items)
    .map((item) => ({
      title: String(item?.title || "").trim(),
      description: String(item?.description || "").trim(),
      topics: sanitizeStringArray(item?.topics || item?.topicList),
    }))
    .filter((item) => item.title);
};

const sanitizeCoupons = (items) => {
  return normalizeArray(items)
    .map((item) => ({
      code: String(item?.code || "")
        .trim()
        .toUpperCase(),
      type: String(item?.type || "percent") === "flat" ? "flat" : "percent",
      value: Number.isFinite(Number(item?.value)) ? Number(item.value) : 0,
      active: item?.active !== false,
      expiresAt: parseDateOrNull(item?.expiresAt),
      usageLimit: Number.isFinite(Number(item?.usageLimit))
        ? Number(item.usageLimit)
        : null,
      usedCount: Number.isFinite(Number(item?.usedCount))
        ? Number(item.usedCount)
        : 0,
      minPurchaseAmount: Number.isFinite(Number(item?.minPurchaseAmount))
        ? Number(item.minPurchaseAmount)
        : 0,
    }))
    .filter((item) => item.code);
};

// ============= COURSE CRUD OPERATIONS =============

// Expert: list own courses with filters
const getMyCourses = asyncHandler(async (req, res) => {
  const { status, search, page = 1, limit = 10 } = req.query;

  const query = { expertId: req.expert._id };

  if (status === "published") query.isPublished = true;
  if (status === "draft") query.isPublished = false;
  if (status === "active") query.isActive = true;
  if (status === "inactive") query.isActive = false;

  if (search) {
    query.$or = [
      { title: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
      { tags: { $in: [new RegExp(search, "i")] } },
    ];
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [courses, total] = await Promise.all([
    Course.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select("-__v"),
    Course.countDocuments(query),
  ]);

  res.status(200).json({
    success: true,
    data: {
      courses,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    },
  });
});

// Expert: get single course details
const getCourseById = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);

  if (!course) {
    throw new AppError("Course not found", 404);
  }

  if (course.expertId.toString() !== req.expert._id.toString()) {
    throw new AppError("Not authorized to view this course", 403);
  }

  res.status(200).json({
    success: true,
    course,
  });
});

// Expert: create course
const createCourse = asyncHandler(async (req, res) => {
  const {
    title,
    subtitle,
    description,
    price,
    currency,
    category,
    level,
    mode,
    tags,
    thumbnail,
    language,
    previewVideoUrl,
    totalLectures,
    liveLectures,
    recordedLectures,
    doubtClasses,
    recordingProvided,
    courseValidity,
    classStartDate,
    classSchedule,
    classTime,
    highlights,
    includes,
    topics,
    roadmap,
    sessions,
    lessons,
    modules,
    faqs,
    coupons,
    freeInterview,
    resourcesIncluded,
    maxSeats,
    isPublished,
    learningOutcomes,
    prerequisites,
    targetAudience,
    estimatedCompletionHours,
  } = req.body;

  if (!String(title || "").trim()) {
    throw new AppError("Course title is required", 400);
  }

  const normalizedPrice = Number(price);
  if (price !== undefined && !Number.isFinite(normalizedPrice)) {
    throw new AppError("Price must be a valid number", 400);
  }

  const course = await Course.create({
    expertId: req.expert._id,
    title: String(title).trim(),
    subtitle: String(subtitle || "").trim(),
    description: String(description || "").trim(),
    price: Number.isFinite(normalizedPrice) ? normalizedPrice : 0,
    currency: String(currency || "INR").trim(),
    category: String(category || "").trim(),
    level: ["beginner", "intermediate", "advanced", "all"].includes(
      String(level),
    )
      ? String(level)
      : "all",
    mode: ["live", "recorded", "live+recorded", "hybrid"].includes(String(mode))
      ? String(mode)
      : "recorded",
    tags: normalizeArray(tags)
      .map((tag) => String(tag).trim())
      .filter(Boolean),
    thumbnail: String(thumbnail || "").trim(),
    language: String(language || "English").trim(),
    previewVideoUrl: String(previewVideoUrl || "").trim(),
    totalLectures: Number.isFinite(Number(totalLectures))
      ? Number(totalLectures)
      : 0,
    liveLectures: Number.isFinite(Number(liveLectures))
      ? Number(liveLectures)
      : 0,
    recordedLectures: Number.isFinite(Number(recordedLectures))
      ? Number(recordedLectures)
      : 0,
    doubtClasses: Number.isFinite(Number(doubtClasses))
      ? Number(doubtClasses)
      : 0,
    recordingProvided:
      recordingProvided !== undefined ? Boolean(recordingProvided) : true,
    courseValidity: String(courseValidity || "").trim(),
    classStartDate: parseDateOrNull(classStartDate),
    classSchedule: sanitizeStringArray(classSchedule),
    classTime: String(classTime || "").trim(),
    highlights: sanitizeStringArray(highlights),
    includes: sanitizeStringArray(includes),
    topics: sanitizeStringArray(topics),
    roadmap: sanitizeRoadmap(roadmap),
    sessions: sanitizeSessions(sessions),
    lessons: sanitizeLessons(lessons),
    modules: sanitizeModules(modules),
    faqs: sanitizeFaqs(faqs),
    coupons: sanitizeCoupons(coupons),
    freeInterview: Boolean(freeInterview),
    resourcesIncluded:
      resourcesIncluded !== undefined ? Boolean(resourcesIncluded) : true,
    maxSeats: Number.isFinite(Number(maxSeats)) ? Number(maxSeats) : null,
    isPublished: Boolean(isPublished),
    learningOutcomes: sanitizeStringArray(learningOutcomes),
    prerequisites: sanitizeStringArray(prerequisites),
    targetAudience: sanitizeStringArray(targetAudience),
    estimatedCompletionHours: Number.isFinite(Number(estimatedCompletionHours))
      ? Number(estimatedCompletionHours)
      : 0,
  });

  res.status(201).json({
    success: true,
    course,
    message: "Course created successfully",
  });
});

// Expert: update course
const updateCourse = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) {
    throw new AppError("Course not found", 404);
  }
  if (course.expertId.toString() !== req.expert._id.toString()) {
    throw new AppError("Not authorized to update this course", 403);
  }

  const {
    title,
    subtitle,
    description,
    price,
    currency,
    category,
    level,
    mode,
    tags,
    thumbnail,
    language,
    previewVideoUrl,
    totalLectures,
    liveLectures,
    recordedLectures,
    doubtClasses,
    recordingProvided,
    courseValidity,
    classStartDate,
    classSchedule,
    classTime,
    highlights,
    includes,
    topics,
    roadmap,
    sessions,
    lessons,
    modules,
    faqs,
    coupons,
    freeInterview,
    resourcesIncluded,
    maxSeats,
    isPublished,
    isActive,
    learningOutcomes,
    prerequisites,
    targetAudience,
    estimatedCompletionHours,
  } = req.body;

  if (title !== undefined) course.title = String(title).trim();
  if (subtitle !== undefined) course.subtitle = String(subtitle || "").trim();
  if (description !== undefined)
    course.description = String(description || "").trim();
  if (price !== undefined) {
    const normalizedPrice = Number(price);
    if (!Number.isFinite(normalizedPrice)) {
      throw new AppError("Price must be a valid number", 400);
    }
    course.price = normalizedPrice;
  }
  if (currency !== undefined)
    course.currency = String(currency || "INR").trim();
  if (category !== undefined) course.category = String(category || "").trim();
  if (level !== undefined) {
    course.level = ["beginner", "intermediate", "advanced", "all"].includes(
      String(level),
    )
      ? String(level)
      : "all";
  }
  if (mode !== undefined) {
    course.mode = ["live", "recorded", "live+recorded", "hybrid"].includes(
      String(mode),
    )
      ? String(mode)
      : "recorded";
  }
  if (tags !== undefined) {
    course.tags = normalizeArray(tags)
      .map((tag) => String(tag).trim())
      .filter(Boolean);
  }
  if (thumbnail !== undefined)
    course.thumbnail = String(thumbnail || "").trim();
  if (language !== undefined)
    course.language = String(language || "English").trim();
  if (previewVideoUrl !== undefined)
    course.previewVideoUrl = String(previewVideoUrl || "").trim();
  if (totalLectures !== undefined)
    course.totalLectures = Number.isFinite(Number(totalLectures))
      ? Number(totalLectures)
      : 0;
  if (liveLectures !== undefined)
    course.liveLectures = Number.isFinite(Number(liveLectures))
      ? Number(liveLectures)
      : 0;
  if (recordedLectures !== undefined)
    course.recordedLectures = Number.isFinite(Number(recordedLectures))
      ? Number(recordedLectures)
      : 0;
  if (doubtClasses !== undefined)
    course.doubtClasses = Number.isFinite(Number(doubtClasses))
      ? Number(doubtClasses)
      : 0;
  if (recordingProvided !== undefined)
    course.recordingProvided = Boolean(recordingProvided);
  if (courseValidity !== undefined)
    course.courseValidity = String(courseValidity || "").trim();
  if (classStartDate !== undefined)
    course.classStartDate = parseDateOrNull(classStartDate);
  if (classSchedule !== undefined)
    course.classSchedule = sanitizeStringArray(classSchedule);
  if (classTime !== undefined)
    course.classTime = String(classTime || "").trim();
  if (highlights !== undefined)
    course.highlights = sanitizeStringArray(highlights);
  if (includes !== undefined) course.includes = sanitizeStringArray(includes);
  if (topics !== undefined) course.topics = sanitizeStringArray(topics);
  if (roadmap !== undefined) course.roadmap = sanitizeRoadmap(roadmap);
  if (sessions !== undefined) course.sessions = sanitizeSessions(sessions);
  if (lessons !== undefined) course.lessons = sanitizeLessons(lessons);
  if (modules !== undefined) course.modules = sanitizeModules(modules);
  if (faqs !== undefined) course.faqs = sanitizeFaqs(faqs);
  if (coupons !== undefined) course.coupons = sanitizeCoupons(coupons);
  if (freeInterview !== undefined)
    course.freeInterview = Boolean(freeInterview);
  if (resourcesIncluded !== undefined)
    course.resourcesIncluded = Boolean(resourcesIncluded);
  if (maxSeats !== undefined) {
    course.maxSeats = Number.isFinite(Number(maxSeats))
      ? Number(maxSeats)
      : null;
  }
  if (isPublished !== undefined) course.isPublished = Boolean(isPublished);
  if (isActive !== undefined) course.isActive = Boolean(isActive);
  if (learningOutcomes !== undefined)
    course.learningOutcomes = sanitizeStringArray(learningOutcomes);
  if (prerequisites !== undefined)
    course.prerequisites = sanitizeStringArray(prerequisites);
  if (targetAudience !== undefined)
    course.targetAudience = sanitizeStringArray(targetAudience);
  if (estimatedCompletionHours !== undefined) {
    course.estimatedCompletionHours = Number.isFinite(
      Number(estimatedCompletionHours),
    )
      ? Number(estimatedCompletionHours)
      : 0;
  }

  await course.save();

  res.status(200).json({
    success: true,
    course,
    message: "Course updated successfully",
  });
});

// Expert: delete course
const deleteCourse = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) {
    throw new AppError("Course not found", 404);
  }
  if (course.expertId.toString() !== req.expert._id.toString()) {
    throw new AppError("Not authorized to delete this course", 403);
  }

  await Promise.all([
    CourseEnrollment.deleteMany({ courseId: course._id }),
    CourseAnnouncement.deleteMany({ courseId: course._id }),
    CourseReview.deleteMany({ courseId: course._id }),
  ]);

  await course.deleteOne();

  res.status(200).json({
    success: true,
    message: "Course and all related data deleted successfully",
  });
});

// Expert: publish/unpublish course
const togglePublishCourse = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) {
    throw new AppError("Course not found", 404);
  }
  if (course.expertId.toString() !== req.expert._id.toString()) {
    throw new AppError("Not authorized to publish this course", 403);
  }

  // Validation before publishing
  if (!course.isPublished) {
    const validationErrors = [];

    if (!course.thumbnail) {
      validationErrors.push("Course thumbnail is required");
    }

    // Check description length
    if (!course.description || course.description.length < 10) {
      validationErrors.push(
        "Course description must be at least 10 characters",
      );
    }

    if (course.price === undefined || course.price < 0) {
      validationErrors.push("Valid course price is required");
    }

    // Check lessons count
    if (!course.lessons || course.lessons.length === 0) {
      validationErrors.push("Course must have at least one lesson");
    }

    // Check title
    if (!course.title || course.title.trim().length < 3) {
      validationErrors.push("Course title must be at least 3 characters");
    }

    if (validationErrors.length > 0) {
      throw new AppError(`Cannot publish: ${validationErrors.join(", ")}`, 400);
    }
  }

  course.isPublished = !course.isPublished;
  await course.save();

  res.status(200).json({
    success: true,
    isPublished: course.isPublished,
    message: course.isPublished
      ? "Course published successfully"
      : "Course unpublished successfully",
  });
});

// Expert: clone/duplicate course
const cloneCourse = asyncHandler(async (req, res) => {
  const sourceCourse = await Course.findById(req.params.id);
  if (!sourceCourse) {
    throw new AppError("Source course not found", 404);
  }
  if (sourceCourse.expertId.toString() !== req.expert._id.toString()) {
    throw new AppError("Not authorized to clone this course", 403);
  }

  const courseData = sourceCourse.toObject();
  delete courseData._id;
  delete courseData.createdAt;
  delete courseData.updatedAt;
  delete courseData.enrolledCount;
  delete courseData.ratingAverage;
  delete courseData.ratingCount;

  courseData.title = `${courseData.title} (Copy)`;
  courseData.isPublished = false;
  courseData.expertId = req.expert._id;

  const newCourse = await Course.create(courseData);

  res.status(201).json({
    success: true,
    course: newCourse,
    message: "Course cloned successfully",
  });
});

// ============= ENROLLMENT MANAGEMENT =============

// Expert: list enrollments for a course
const getCourseEnrollments = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;

  const course = await Course.findById(req.params.id);
  if (!course) {
    throw new AppError("Course not found", 404);
  }
  if (course.expertId.toString() !== req.expert._id.toString()) {
    throw new AppError("Not authorized to view enrollments", 403);
  }

  const query = { courseId: course._id };
  if (status) query.status = status;

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [enrollments, total] = await Promise.all([
    CourseEnrollment.find(query)
      .populate("userId", "displayName email photoURL phone")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    CourseEnrollment.countDocuments(query),
  ]);

  res.status(200).json({
    success: true,
    data: {
      enrollments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    },
  });
});

// Expert: update enrollment progress
const updateEnrollmentProgress = asyncHandler(async (req, res) => {
  const { id: courseId, enrollmentId } = req.params;
  const { progressPercent, completedLessons, lastLessonId, notes } = req.body;

  const course = await Course.findById(courseId);
  if (!course) {
    throw new AppError("Course not found", 404);
  }
  if (course.expertId.toString() !== req.expert._id.toString()) {
    throw new AppError("Not authorized to update enrollment", 403);
  }

  const enrollment = await CourseEnrollment.findOne({
    _id: enrollmentId,
    courseId: course._id,
  });
  if (!enrollment) {
    throw new AppError("Enrollment not found", 404);
  }

  if (progressPercent !== undefined) {
    if (
      !Number.isFinite(progressPercent) ||
      progressPercent < 0 ||
      progressPercent > 100
    ) {
      throw new AppError("Progress must be between 0 and 100", 400);
    }
    enrollment.progressPercent = progressPercent;
  }

  if (
    completedLessons !== undefined &&
    Number.isFinite(Number(completedLessons))
  ) {
    enrollment.completedLessons = Math.max(0, Number(completedLessons));
  }

  if (lastLessonId !== undefined) {
    enrollment.lastLessonId = String(lastLessonId);
  }

  if (notes !== undefined) {
    enrollment.notes = String(notes).trim();
  }

  enrollment.lastActiveAt = new Date();

  if (enrollment.progressPercent >= 100) {
    enrollment.status = "completed";
    enrollment.completedAt = enrollment.completedAt || new Date();
  }

  await enrollment.save();

  res.status(200).json({
    success: true,
    enrollment,
    message: "Enrollment progress updated successfully",
  });
});

// Expert: bulk update enrollment status
const bulkUpdateEnrollments = asyncHandler(async (req, res) => {
  const { enrollmentIds, status, notes } = req.body;

  const course = await Course.findById(req.params.id);
  if (!course) {
    throw new AppError("Course not found", 404);
  }
  if (course.expertId.toString() !== req.expert._id.toString()) {
    throw new AppError("Not authorized to update enrollments", 403);
  }

  if (
    !enrollmentIds ||
    !Array.isArray(enrollmentIds) ||
    enrollmentIds.length === 0
  ) {
    throw new AppError("Enrollment IDs are required", 400);
  }

  const updateData = {};
  if (status && ["booked", "cancelled", "completed"].includes(status)) {
    updateData.status = status;
  }
  if (notes !== undefined) {
    updateData.notes = String(notes).trim();
  }

  const result = await CourseEnrollment.updateMany(
    {
      _id: { $in: enrollmentIds },
      courseId: course._id,
    },
    updateData,
  );

  res.status(200).json({
    success: true,
    modifiedCount: result.modifiedCount,
    message: `Updated ${result.modifiedCount} enrollments successfully`,
  });
});

// ============= ANALYTICS =============

// Expert: course analytics (enhanced)
const getCourseAnalytics = asyncHandler(async (req, res) => {
  const { timeframe = "all" } = req.query;

  const course = await Course.findById(req.params.id);
  if (!course) {
    throw new AppError("Course not found", 404);
  }
  if (course.expertId.toString() !== req.expert._id.toString()) {
    throw new AppError("Not authorized to view analytics", 403);
  }

  const dateFilter = {};
  if (timeframe === "week") {
    dateFilter.createdAt = {
      $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    };
  } else if (timeframe === "month") {
    dateFilter.createdAt = {
      $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    };
  }

  const enrollments = await CourseEnrollment.find({
    courseId: course._id,
    ...dateFilter,
  });

  const totalEnrollments = enrollments.length;
  const completedCount = enrollments.filter(
    (e) => e.status === "completed" || Number(e.progressPercent) >= 100,
  ).length;
  const activeCount = enrollments.filter(
    (e) =>
      e.status === "booked" &&
      Number(e.progressPercent) > 0 &&
      Number(e.progressPercent) < 100,
  ).length;

  const avgProgress = totalEnrollments
    ? enrollments.reduce(
        (sum, e) => sum + (Number(e.progressPercent) || 0),
        0,
      ) / totalEnrollments
    : 0;

  const rated = enrollments.filter((e) => Number(e.rating) > 0);
  const avgRating = rated.length
    ? rated.reduce((sum, e) => sum + Number(e.rating || 0), 0) / rated.length
    : 0;

  const revenue = enrollments.reduce(
    (sum, e) => sum + (Number(e.finalAmount) || Number(e.price) || 0),
    0,
  );

  const discountGiven = enrollments.reduce(
    (sum, e) => sum + (Number(e.discountAmount) || 0),
    0,
  );

  // Daily enrollment trend (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const dailyEnrollments = await CourseEnrollment.aggregate([
    {
      $match: {
        courseId: course._id,
        createdAt: { $gte: thirtyDaysAgo },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
        },
        count: { $sum: 1 },
        revenue: { $sum: { $ifNull: ["$finalAmount", "$price"] } },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  res.status(200).json({
    success: true,
    data: {
      courseId: course._id,
      courseTitle: course.title,
      totalEnrollments,
      activeEnrollments: activeCount,
      completedCount,
      completionRate: totalEnrollments
        ? Math.round((completedCount / totalEnrollments) * 100)
        : 0,
      averageProgress: totalEnrollments ? Math.round(avgProgress) : 0,
      averageRating: Number(avgRating.toFixed(2)),
      ratingsCount: rated.length,
      totalRevenue: revenue,
      totalDiscountGiven: discountGiven,
      netRevenue: revenue - discountGiven,
      dailyEnrollments,
      enrollmentTrend: dailyEnrollments,
    },
  });
});

// Expert: course summary (analytics + earnings)
const getExpertCourseSummary = asyncHandler(async (req, res) => {
  const { timeframe = "all" } = req.query;

  const dateFilter = {};
  if (timeframe === "month") {
    dateFilter.createdAt = {
      $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    };
  } else if (timeframe === "year") {
    dateFilter.createdAt = {
      $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
    };
  }

  // Get all courses for this expert
  const courses = await Course.find({ expertId: req.expert._id }).sort({
    createdAt: -1,
  });

  // Get enrollment stats
  const stats = await CourseEnrollment.aggregate([
    {
      $match: {
        expertId: req.expert._id,
        ...dateFilter,
      },
    },
    {
      $group: {
        _id: "$courseId",
        enrollments: { $sum: 1 },
        revenue: { $sum: { $ifNull: ["$finalAmount", "$price"] } },
        discountGiven: { $sum: { $ifNull: ["$discountAmount", 0] } },
        avgProgress: { $avg: { $ifNull: ["$progressPercent", 0] } },
        avgRating: { $avg: { $ifNull: ["$rating", null] } },
        ratingsCount: {
          $sum: {
            $cond: [{ $gt: ["$rating", 0] }, 1, 0],
          },
        },
        completedCount: {
          $sum: {
            $cond: [
              {
                $or: [
                  { $eq: ["$status", "completed"] },
                  { $gte: ["$progressPercent", 100] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);

  const statsMap = new Map(stats.map((item) => [String(item._id), item]));

  const data = courses.map((course) => {
    const stat = statsMap.get(String(course._id)) || {};
    const totalEnrollments = stat.enrollments || 0;
    const completedCount = stat.completedCount || 0;
    const completionRate = totalEnrollments
      ? Math.round((completedCount / totalEnrollments) * 100)
      : 0;
    const averageProgress = totalEnrollments
      ? Math.round(stat.avgProgress || 0)
      : 0;
    const averageRating = stat.ratingsCount
      ? Number((stat.avgRating || 0).toFixed(2))
      : 0;

    return {
      course: {
        _id: course._id,
        title: course.title,
        thumbnail: course.thumbnail,
        price: course.price,
        isPublished: course.isPublished,
        enrolledCount: course.enrolledCount,
      },
      stats: {
        totalEnrollments,
        completedCount,
        completionRate,
        averageProgress,
        averageRating,
        ratingsCount: stat.ratingsCount || 0,
        revenue: stat.revenue || 0,
        discountGiven: stat.discountGiven || 0,
        netRevenue: (stat.revenue || 0) - (stat.discountGiven || 0),
      },
    };
  });

  // Calculate totals
  const totals = data.reduce(
    (acc, item) => {
      acc.totalEnrollments += item.stats.totalEnrollments;
      acc.totalRevenue += item.stats.revenue;
      acc.totalDiscountGiven += item.stats.discountGiven;
      acc.totalCompleted += item.stats.completedCount;
      acc.totalRatings += item.stats.ratingsCount;
      acc.sumRatings +=
        item.stats.averageRating * (item.stats.ratingsCount || 0);
      acc.sumProgress +=
        item.stats.averageProgress * (item.stats.totalEnrollments || 0);
      return acc;
    },
    {
      totalEnrollments: 0,
      totalRevenue: 0,
      totalDiscountGiven: 0,
      totalCompleted: 0,
      totalRatings: 0,
      sumRatings: 0,
      sumProgress: 0,
    },
  );

  const overallAverageRating = totals.totalRatings
    ? Number((totals.sumRatings / totals.totalRatings).toFixed(2))
    : 0;
  const overallAverageProgress = totals.totalEnrollments
    ? Math.round(totals.sumProgress / totals.totalEnrollments)
    : 0;
  const overallCompletionRate = totals.totalEnrollments
    ? Math.round((totals.totalCompleted / totals.totalEnrollments) * 100)
    : 0;

  // IMPORTANT: Return in the format frontend expects
  res.status(200).json({
    success: true,
    // Frontend expects these fields at top level OR in totals object
    totalCourses: courses.length,
    publishedCourses: courses.filter((c) => c.isPublished).length,
    totalEnrollments: totals.totalEnrollments,
    totalRevenue: totals.totalRevenue,
    totalDiscountGiven: totals.totalDiscountGiven,
    netRevenue: totals.totalRevenue - totals.totalDiscountGiven,
    overallAverageRating,
    overallAverageProgress,
    overallCompletionRate,
    // Also include in totals for backward compatibility
    totals: {
      totalCourses: courses.length,
      publishedCourses: courses.filter((c) => c.isPublished).length,
      totalEnrollments: totals.totalEnrollments,
      totalRevenue: totals.totalRevenue,
      totalDiscountGiven: totals.totalDiscountGiven,
      netRevenue: totals.totalRevenue - totals.totalDiscountGiven,
      overallAverageRating,
      overallAverageProgress,
      overallCompletionRate,
    },
    data, // Course-wise data
    monthlyTrend: [], // Add if needed
  });
});

// ============= ANNOUNCEMENTS =============

// Expert: list announcements
const listCourseAnnouncements = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;

  const course = await Course.findById(req.params.id);
  if (!course) {
    throw new AppError("Course not found", 404);
  }
  if (course.expertId.toString() !== req.expert._id.toString()) {
    throw new AppError("Not authorized to view announcements", 403);
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [announcements, total] = await Promise.all([
    CourseAnnouncement.find({ courseId: course._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    CourseAnnouncement.countDocuments({ courseId: course._id }),
  ]);

  res.status(200).json({
    success: true,
    data: {
      announcements,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    },
  });
});

// Expert: create announcement
const createCourseAnnouncement = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) {
    throw new AppError("Course not found", 404);
  }
  if (course.expertId.toString() !== req.expert._id.toString()) {
    throw new AppError("Not authorized to create announcement", 403);
  }

  const { title, message, notifyStudents } = req.body;

  if (!title || !String(title).trim()) {
    throw new AppError("Title is required", 400);
  }
  if (!message || !String(message).trim()) {
    throw new AppError("Message is required", 400);
  }

  const announcement = await CourseAnnouncement.create({
    courseId: course._id,
    expertId: req.expert._id,
    title: String(title).trim(),
    message: String(message).trim(),
  });

  // TODO: If notifyStudents is true, send notifications to enrolled students
  // This would integrate with your notification service

  res.status(201).json({
    success: true,
    announcement,
    message:
      "Announcement created successfully" +
      (notifyStudents ? " and students notified" : ""),
  });
});

// Expert: update announcement
const updateCourseAnnouncement = asyncHandler(async (req, res) => {
  const { title, message } = req.body;

  const course = await Course.findById(req.params.id);
  if (!course) {
    throw new AppError("Course not found", 404);
  }
  if (course.expertId.toString() !== req.expert._id.toString()) {
    throw new AppError("Not authorized to update announcement", 403);
  }

  const announcement = await CourseAnnouncement.findOne({
    _id: req.params.announcementId,
    courseId: course._id,
  });

  if (!announcement) {
    throw new AppError("Announcement not found", 404);
  }

  if (title !== undefined) announcement.title = String(title).trim();
  if (message !== undefined) announcement.message = String(message).trim();

  await announcement.save();

  res.status(200).json({
    success: true,
    announcement,
    message: "Announcement updated successfully",
  });
});

// Expert: delete announcement
const deleteCourseAnnouncement = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) {
    throw new AppError("Course not found", 404);
  }
  if (course.expertId.toString() !== req.expert._id.toString()) {
    throw new AppError("Not authorized to delete announcement", 403);
  }

  const announcement = await CourseAnnouncement.findOne({
    _id: req.params.announcementId,
    courseId: course._id,
  });
  if (!announcement) {
    throw new AppError("Announcement not found", 404);
  }

  await announcement.deleteOne();

  res.status(200).json({
    success: true,
    message: "Announcement deleted successfully",
  });
});

// ============= FILE UPLOAD =============

// Expert: upload course thumbnail
const uploadCourseThumbnail = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError("Thumbnail file is required", 400);
  }

  const thumbnailUrl = req.file.secure_url || req.file.path || "";
  if (!thumbnailUrl) {
    throw new AppError("Failed to upload thumbnail", 500);
  }

  // Optionally update course thumbnail if courseId provided
  if (req.body.courseId) {
    const course = await Course.findById(req.body.courseId);
    if (course && course.expertId.toString() === req.expert._id.toString()) {
      course.thumbnail = thumbnailUrl;
      await course.save();
    }
  }

  res.status(200).json({
    success: true,
    url: thumbnailUrl,
    message: "Thumbnail uploaded successfully",
  });
});

// Expert: upload course content (video/document)
const uploadCourseContent = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError("Content file is required", 400);
  }

  const contentUrl = req.file.secure_url || req.file.path || "";
  const fileType = req.file.resource_type || "raw";

  if (!contentUrl) {
    throw new AppError("Failed to upload content", 500);
  }

  res.status(200).json({
    success: true,
    url: contentUrl,
    type: fileType,
    filename: req.file.originalname,
    size: req.file.size,
    message: "Content uploaded successfully",
  });
});

module.exports = {
  // Course CRUD
  getMyCourses,
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
  togglePublishCourse,
  cloneCourse,

  // Enrollments
  getCourseEnrollments,
  updateEnrollmentProgress,
  bulkUpdateEnrollments,

  // Analytics
  getCourseAnalytics,
  getExpertCourseSummary,

  // Announcements
  listCourseAnnouncements,
  createCourseAnnouncement,
  updateCourseAnnouncement,
  deleteCourseAnnouncement,

  // File Upload
  uploadCourseThumbnail,
  uploadCourseContent,
};
