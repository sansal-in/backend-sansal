const Course = require('../../models/Course');
const { asyncHandler, AppError } = require('../../middleware/errorMiddleware');
const { v4: uuidv4 } = require('uuid');

// Expert: get all lessons for a course
const getCourseLessons = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.courseId);
  
  if (!course) {
    throw new AppError('Course not found', 404);
  }
  
  if (course.expertId.toString() !== req.expert._id.toString()) {
    throw new AppError('Not authorized to view lessons', 403);
  }

  const lessons = course.lessons || [];
  
  res.status(200).json({
    success: true,
    totalLessons: lessons.length,
    lessons: lessons.sort((a, b) => (a.order || 0) - (b.order || 0))
  });
});

// Expert: get single lesson
const getLessonById = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.courseId);
  
  if (!course) {
    throw new AppError('Course not found', 404);
  }
  
  if (course.expertId.toString() !== req.expert._id.toString()) {
    throw new AppError('Not authorized to view lesson', 403);
  }

  const lesson = course.lessons.find(l => l.lessonId === req.params.lessonId);
  
  if (!lesson) {
    throw new AppError('Lesson not found', 404);
  }

  res.status(200).json({
    success: true,
    lesson
  });
});

// Expert: add lesson to course
const addLesson = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.courseId);
  
  if (!course) {
    throw new AppError('Course not found', 404);
  }
  
  if (course.expertId.toString() !== req.expert._id.toString()) {
    throw new AppError('Not authorized to add lesson', 403);
  }

  const {
    title, type, description, durationMinutes, contentUrl,
    meetingLink, resources, quiz, assignment, isPreview, order
  } = req.body;

  if (!title || !String(title).trim()) {
    throw new AppError('Lesson title is required', 400);
  }

  // Generate unique lessonId
  const newLesson = {
    lessonId: uuidv4(),  // ← ADD THIS
    title: String(title).trim(),
    type: ['video', 'document', 'quiz', 'assignment', 'live'].includes(type) ? type : 'video',
    description: String(description || '').trim(),
    durationMinutes: Number.isFinite(Number(durationMinutes)) ? Number(durationMinutes) : 30,
    contentUrl: String(contentUrl || '').trim(),
    meetingLink: String(meetingLink || '').trim(),
    order: Number.isFinite(Number(order)) ? Number(order) : (course.lessons?.length || 0),
    isPreview: Boolean(isPreview),
    resources: Array.isArray(resources) ? resources : [],
    quiz: quiz || { questions: [] },
    assignment: assignment || { prompt: '', dueDate: null, maxScore: 100 }
  };

  course.lessons = course.lessons || [];
  course.lessons.push(newLesson);
  
  course.totalLectures = course.lessons.length;
  
  await course.save();

  res.status(201).json({
    success: true,
    lesson: newLesson,
    message: 'Lesson added successfully'
  });
});

// Expert: update lesson - find by composite key if needed
const updateLesson = asyncHandler(async (req, res) => {
  const { courseId, lessonId } = req.params;

  const course = await Course.findById(courseId);
  
  if (!course) {
    throw new AppError('Course not found', 404);
  }
  
  if (course.expertId.toString() !== req.expert._id.toString()) {
    throw new AppError('Not authorized to update lesson', 403);
  }

  // Find lesson by lessonId OR by index if it's a temporary composite key
  let lessonIndex = course.lessons?.findIndex(l => l.lessonId === lessonId);
  
  // If not found by lessonId, check if lessonId is a composite key (from frontend fallback)
  if (lessonIndex === -1) {
    // Try to match by title and type from composite key
    // Format: "title-type-index"
    const parts = lessonId.split('-');
    if (parts.length >= 2) {
      const titlePart = parts.slice(0, -2).join('-'); // Remove type and index
      const typePart = parts[parts.length - 2];
      const indexPart = parts[parts.length - 1];
      
      lessonIndex = course.lessons?.findIndex((l, idx) => 
        l.title === titlePart && l.type === typePart && idx === parseInt(indexPart)
      );
    }
  }
  
  if (lessonIndex === undefined || lessonIndex === -1) {
    throw new AppError('Lesson not found', 404);
  }

  const lesson = course.lessons[lessonIndex];
  
  // If lesson doesn't have lessonId, add it now
  if (!lesson.lessonId) {
    lesson.lessonId = uuidv4();
  }
  
  const { title, type, description, durationMinutes, contentUrl, meetingLink, resources, quiz, assignment, isPreview } = req.body;

  if (title !== undefined) lesson.title = String(title).trim();
  if (type !== undefined) {
    lesson.type = ['video', 'document', 'quiz', 'assignment', 'live'].includes(type) ? type : lesson.type;
  }
  if (description !== undefined) lesson.description = String(description).trim();
  if (durationMinutes !== undefined) {
    lesson.durationMinutes = Number.isFinite(Number(durationMinutes)) ? Number(durationMinutes) : lesson.durationMinutes;
  }
  if (contentUrl !== undefined) lesson.contentUrl = String(contentUrl).trim();
  if (meetingLink !== undefined) lesson.meetingLink = String(meetingLink).trim();
  if (resources !== undefined) lesson.resources = Array.isArray(resources) ? resources : [];
  if (quiz !== undefined) lesson.quiz = quiz;
  if (assignment !== undefined) lesson.assignment = assignment;
  if (isPreview !== undefined) lesson.isPreview = Boolean(isPreview);

  await course.save();

  res.status(200).json({
    success: true,
    lesson,
    message: 'Lesson updated successfully'
  });
});

// Similar fix for deleteLesson
const deleteLesson = asyncHandler(async (req, res) => {
  const { courseId, lessonId } = req.params;
  const course = await Course.findById(courseId);
  
  if (!course) {
    throw new AppError('Course not found', 404);
  }
  
  if (course.expertId.toString() !== req.expert._id.toString()) {
    throw new AppError('Not authorized to delete lesson', 403);
  }

  // Find lesson by lessonId OR by composite key
  let lessonIndex = course.lessons?.findIndex(l => l.lessonId === lessonId);
  
  if (lessonIndex === -1) {
    const parts = lessonId.split('-');
    if (parts.length >= 2) {
      const titlePart = parts.slice(0, -2).join('-');
      const typePart = parts[parts.length - 2];
      const indexPart = parts[parts.length - 1];
      
      lessonIndex = course.lessons?.findIndex((l, idx) => 
        l.title === titlePart && l.type === typePart && idx === parseInt(indexPart)
      );
    }
  }
  
  if (lessonIndex === undefined || lessonIndex === -1) {
    throw new AppError('Lesson not found', 404);
  }

  course.lessons.splice(lessonIndex, 1);
  course.totalLectures = course.lessons.length;
  
  await course.save();

  res.status(200).json({
    success: true,
    message: 'Lesson deleted successfully'
  });
});

// Expert: reorder lessons
const reorderLessons = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.courseId);
  
  if (!course) {
    throw new AppError('Course not found', 404);
  }
  
  if (course.expertId.toString() !== req.expert._id.toString()) {
    throw new AppError('Not authorized to reorder lessons', 403);
  }

  const { lessonOrders } = req.body;
  
  if (!Array.isArray(lessonOrders)) {
    throw new AppError('lessonOrders array is required', 400);
  }

  const lessonMap = new Map(course.lessons.map(l => [l.lessonId, l]));
  
  for (const item of lessonOrders) {
    const lesson = lessonMap.get(item.lessonId);
    if (lesson) {
      lesson.order = Number(item.order);
    }
  }

  await course.save();

  res.status(200).json({
    success: true,
    lessons: course.lessons.sort((a, b) => a.order - b.order),
    message: 'Lessons reordered successfully'
  });
});

// Expert: bulk import lessons
const bulkImportLessons = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.courseId);
  
  if (!course) {
    throw new AppError('Course not found', 404);
  }
  
  if (course.expertId.toString() !== req.expert._id.toString()) {
    throw new AppError('Not authorized to import lessons', 403);
  }

  const { lessons } = req.body;
  
  if (!Array.isArray(lessons) || lessons.length === 0) {
    throw new AppError('Lessons array is required', 400);
  }

  const newLessons = lessons.map((lesson, index) => ({
    lessonId: uuidv4(),
    title: String(lesson.title || '').trim(),
    type: ['video', 'document', 'quiz', 'assignment', 'live'].includes(lesson.type) ? lesson.type : 'video',
    description: String(lesson.description || '').trim(),
    durationMinutes: Number.isFinite(Number(lesson.durationMinutes)) ? Number(lesson.durationMinutes) : 30,
    contentUrl: String(lesson.contentUrl || '').trim(),
    order: (course.lessons?.length || 0) + index,
    isPreview: Boolean(lesson.isPreview),
    resources: []
  })).filter(l => l.title);

  course.lessons = [...(course.lessons || []), ...newLessons];
  course.totalLectures = course.lessons.length;
  
  await course.save();

  res.status(201).json({
    success: true,
    importedCount: newLessons.length,
    message: `${newLessons.length} lessons imported successfully`
  });
});

module.exports = {
  getCourseLessons,
  getLessonById,
  addLesson,
  updateLesson,
  deleteLesson,
  reorderLessons,
  bulkImportLessons
};