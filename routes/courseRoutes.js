const express = require('express');
const {
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
  submitLessonAssignment
} = require('../controllers/courseController');
const { verifyFirebaseToken, verifyExpertToken } = require('../middleware/auth');
const { validateObjectId, sanitizeInput } = require('../middleware/validate');

const router = express.Router();

// Apply sanitization
router.use(sanitizeInput);

// Public routes
router.get('/', listCourses);

// Student routes
router.get('/enrollments/me', verifyFirebaseToken, getMyEnrollments);
router.get('/support/me', verifyFirebaseToken, listMyCourseSupportTickets);

// Course-specific routes
router.get('/:id/reviews', validateObjectId('id'), listCourseReviews);
router.post('/:id/reviews', verifyFirebaseToken, validateObjectId('id'), submitCourseReview);
router.get('/:id/questions', validateObjectId('id'), listCourseQuestions);
router.post('/:id/questions', verifyFirebaseToken, validateObjectId('id'), askCourseQuestion);
router.put('/:id/questions/:questionId/answer', verifyExpertToken, validateObjectId('id'), validateObjectId('questionId'), answerCourseQuestion);
router.post('/:id/support', verifyFirebaseToken, validateObjectId('id'), createCourseSupportTicket);
router.post('/:id/progress', verifyFirebaseToken, validateObjectId('id'), updateMyCourseProgress);
router.post('/:id/lessons/:lessonIndex/quiz', verifyFirebaseToken, validateObjectId('id'), submitLessonQuiz);
router.post('/:id/lessons/:lessonIndex/assignment', verifyFirebaseToken, validateObjectId('id'), submitLessonAssignment);
router.post('/:id/enroll', verifyFirebaseToken, validateObjectId('id'), enrollCourse);

// Public detail (must be last)
router.get('/:id', validateObjectId('id'), getCourseById);

module.exports = router;
