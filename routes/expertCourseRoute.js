const express = require('express');
const {
  getMyCourses,
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
  togglePublishCourse,
  cloneCourse,
  getCourseEnrollments,
  updateEnrollmentProgress,
  bulkUpdateEnrollments,
  getCourseAnalytics,
  getExpertCourseSummary,
  listCourseAnnouncements,
  createCourseAnnouncement,
  updateCourseAnnouncement,
  deleteCourseAnnouncement,
  uploadCourseThumbnail,
  uploadCourseContent
} = require('../controllers/course/courseController');

const {
  getCourseLessons,
  getLessonById,
  addLesson,
  updateLesson,
  deleteLesson,
  reorderLessons,
  bulkImportLessons
} = require('../controllers/course/lessonController');

const {
  getCourseCoupons,
  addCoupon,
  updateCoupon,
  deleteCoupon,
  toggleCouponStatus
} = require('../controllers/course/couponController');

const {
  getCourseReviews,
  getReviewById,
  respondToReview,
  editReviewResponse,
  deleteReviewResponse,
  reportReview
} = require('../controllers/course/reviewController');

const {
  generateCertificate,
  getCourseCertificates,
  downloadCertificate,
  revokeCertificate,
  bulkGenerateCertificates
} = require('../controllers/course/certificateController');

const { verifyExpertToken } = require('../middleware/auth');
const { validateObjectId, sanitizeInput } = require('../middleware/validate');
const { courseUpload, contentUpload } = require('../middleware/courseUpload');

const router = express.Router();

// Apply sanitization to all routes
router.use(sanitizeInput);
router.use(verifyExpertToken); // All routes require expert authentication

// ============= FILE UPLOAD ROUTES =============
router.post('/upload-thumbnail', courseUpload.single('file'), uploadCourseThumbnail);
router.post('/upload-content', contentUpload.single('file'), uploadCourseContent);

// ============= SUMMARY & MY COURSES =============
router.get('/my', getMyCourses);
router.get('/summary', getExpertCourseSummary);

// ============= COURSE CRUD =============
router.post('/', createCourse);
router.get('/:id', validateObjectId('id'), getCourseById);
router.put('/:id', validateObjectId('id'), updateCourse);
router.delete('/:id', validateObjectId('id'), deleteCourse);
router.patch('/:id/publish', validateObjectId('id'), togglePublishCourse);
router.post('/:id/clone', validateObjectId('id'), cloneCourse);

// ============= COURSE ANALYTICS =============
router.get('/:id/analytics', validateObjectId('id'), getCourseAnalytics);

// ============= LESSON ROUTES =============
router.get('/:courseId/lessons', validateObjectId('courseId'), getCourseLessons);
router.post('/:courseId/lessons', validateObjectId('courseId'), addLesson);
router.post('/:courseId/lessons/bulk-import', validateObjectId('courseId'), bulkImportLessons);
router.put('/:courseId/lessons/reorder', validateObjectId('courseId'), reorderLessons);
router.get('/:courseId/lessons/:lessonId', validateObjectId('courseId'), getLessonById);
router.put('/:courseId/lessons/:lessonId', validateObjectId('courseId'), updateLesson);
router.delete('/:courseId/lessons/:lessonId', validateObjectId('courseId'), deleteLesson);

// ============= COUPON ROUTES =============
router.get('/:courseId/coupons', validateObjectId('courseId'), getCourseCoupons);
router.post('/:courseId/coupons', validateObjectId('courseId'), addCoupon);
router.put('/:courseId/coupons/:couponCode', validateObjectId('courseId'), updateCoupon);
router.delete('/:courseId/coupons/:couponCode', validateObjectId('courseId'), deleteCoupon);
router.patch('/:courseId/coupons/:couponCode/toggle', validateObjectId('courseId'), toggleCouponStatus);

// ============= ANNOUNCEMENT ROUTES =============
router.get('/:id/announcements', validateObjectId('id'), listCourseAnnouncements);
router.post('/:id/announcements', validateObjectId('id'), createCourseAnnouncement);
router.put('/:id/announcements/:announcementId', validateObjectId('id'), validateObjectId('announcementId'), updateCourseAnnouncement);
router.delete('/:id/announcements/:announcementId', validateObjectId('id'), validateObjectId('announcementId'), deleteCourseAnnouncement);

// ============= ENROLLMENT ROUTES =============
router.get('/:id/enrollments', validateObjectId('id'), getCourseEnrollments);
router.put('/:id/enrollments/bulk-update', validateObjectId('id'), bulkUpdateEnrollments);
router.put('/:id/enrollments/:enrollmentId/progress', validateObjectId('id'), validateObjectId('enrollmentId'), updateEnrollmentProgress);

// ============= REVIEW ROUTES =============
router.get('/:courseId/reviews', validateObjectId('courseId'), getCourseReviews);
router.get('/:courseId/reviews/:reviewId', validateObjectId('courseId'), validateObjectId('reviewId'), getReviewById);
router.post('/:courseId/reviews/:reviewId/respond', validateObjectId('courseId'), validateObjectId('reviewId'), respondToReview);
router.put('/:courseId/reviews/:reviewId/respond', validateObjectId('courseId'), validateObjectId('reviewId'), editReviewResponse);
router.delete('/:courseId/reviews/:reviewId/respond', validateObjectId('courseId'), validateObjectId('reviewId'), deleteReviewResponse);
router.post('/:courseId/reviews/:reviewId/report', validateObjectId('courseId'), validateObjectId('reviewId'), reportReview);

// ============= CERTIFICATE ROUTES =============
router.get('/:courseId/certificates', validateObjectId('courseId'), getCourseCertificates);
router.post('/:courseId/certificates/bulk-generate', validateObjectId('courseId'), bulkGenerateCertificates);
router.post('/enrollments/:enrollmentId/certificate', validateObjectId('enrollmentId'), generateCertificate);
router.get('/certificates/:certificateId/download', validateObjectId('certificateId'), downloadCertificate);
router.patch('/certificates/:certificateId/revoke', validateObjectId('certificateId'), revokeCertificate);

module.exports = router;