const express = require('express');
const router = express.Router();
const adminController = require('../controllers/AdminController');
const notificationController = require('../controllers/notificationController');
const feedbackController = require('../controllers/feedbackController');
const jwt = require('jsonwebtoken');

// Custom Admin Auth Middleware to handle static admin ID
const adminAuthMiddleware = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const id = decoded.id || decoded._id || decoded.userId;

      // Check for static admin
      if (id === 'static_admin_id') {
        req.user = {
          _id: 'static_admin_id',
          email: 'sandeep854101@gmail.com',
          role: 'admin'
        };
        return next();
      }

      return res.status(401).json({ success: false, error: 'Not authorized as admin' });
    } catch (error) {
      return res.status(401).json({ success: false, error: 'Not authorized, token failed' });
    }
  }
  return res.status(401).json({ success: false, error: 'Not authorized, no token' });
};

/**
 * @swagger
 * /admin/login:
 *   post:
 *     summary: Admin Login
 *     security: []
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 default: sandeep854101@gmail.com
 *               password:
 *                 type: string
 *                 default: Sansal@123
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 token:
 *                   type: string
 *                 user:
 *                   type: object
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', adminController.login);

/**
 * @swagger
 * /admin/stats:
 *   get:
 *     summary: Get dashboard statistics
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
 */
router.get('/stats', adminAuthMiddleware, adminController.getDashboardStats);

/**
 * @swagger
 * /admin/users:
 *   get:
 *     summary: Get all users
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of users retrieved successfully
 */
router.get('/users', adminAuthMiddleware, adminController.getAllUsers);

/**
 * @swagger
 * /admin/users/{id}:
 *   get:
 *     summary: Get a user by ID with full details
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User details retrieved successfully
 */
router.get('/users/:id', adminAuthMiddleware, adminController.getUserById);

/**
 * @swagger
 * /admin/users/{id}/bookings:
 *   get:
 *     summary: Get all bookings for a user by ID
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User bookings retrieved successfully
 */
router.get('/users/:id/bookings', adminAuthMiddleware, adminController.getUserBookings);

/**
 * @swagger
 * /admin/users/{id}/notes:
 *   get:
 *     summary: Get all notes for a user by ID
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User notes retrieved successfully
 */
router.get('/users/:id/notes', adminAuthMiddleware, adminController.getUserNotes);

/**
 * @swagger
 * /admin/users/{id}/aptitude-attempts:
 *   get:
 *     summary: Get all aptitude attempts for a user by ID
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User aptitude attempts retrieved successfully
 */
router.get('/users/:id/aptitude-attempts', adminAuthMiddleware, adminController.getUserAptitudeAttempts);

/**
 * @swagger
 * /admin/users/{id}/data-summary:
 *   get:
 *     summary: Get all related data counts for a user (before deletion)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User data summary retrieved successfully
 */
router.get('/users/:id/data-summary', adminAuthMiddleware, adminController.getUserDataSummary);

/**
 * @swagger
 * /admin/users/{id}:
 *   delete:
 *     summary: Delete a user
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User deleted successfully
 */
router.delete('/users/:id', adminAuthMiddleware, adminController.deleteUser);

/**
 * @swagger
 * /admin/interviews:
 *   get:
 *     summary: Get all interviews
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of interviews retrieved successfully
 */
router.get('/interviews', adminAuthMiddleware, adminController.getAllInterviews);

/**
 * @swagger
 * /admin/interviews/{id}:
 *   delete:
 *     summary: Delete an interview
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Interview ID
 *     responses:
 *       200:
 *         description: Interview deleted successfully
 */
router.delete('/interviews/:id', adminAuthMiddleware, adminController.deleteInterview);

/**
 * @swagger
 * /admin/experts:
 *   get:
 *     summary: Get all experts
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of experts retrieved successfully
 */
router.get('/experts', adminAuthMiddleware, adminController.getAllExperts);

/**
 * @swagger
 * /admin/experts/{id}:
 *   get:
 *     summary: Get an expert by ID with full details
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Expert ID
 *     responses:
 *       200:
 *         description: Expert details retrieved successfully
 */
router.get('/experts/:id', adminAuthMiddleware, adminController.getExpertById);

/**
 * @swagger
 * /admin/experts/{id}:
 *   delete:
 *     summary: Delete an expert by ID
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Expert ID
 *     responses:
 *       200:
 *         description: Expert deleted successfully
 */
router.delete('/experts/:id', adminAuthMiddleware, adminController.deleteExpert);

/**
 * @swagger
 * /admin/bookings:
 *   get:
 *     summary: Get all bookings
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of bookings retrieved successfully
 */
router.get('/bookings', adminAuthMiddleware, adminController.getAllBookings);

/**
 * @swagger
 * /admin/bookings/{id}:
 *   get:
 *     summary: Get a booking by ID with full details
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Booking ID
 *     responses:
 *       200:
 *         description: Booking details retrieved successfully
 */
router.get('/bookings/:id', adminAuthMiddleware, adminController.getBookingById);

/**
 * @swagger
 * /admin/bookings/{id}:
 *   delete:
 *     summary: Delete a booking by ID
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Booking ID
 *     responses:
 *       200:
 *         description: Booking deleted successfully
 */
router.delete('/bookings/:id', adminAuthMiddleware, adminController.deleteBooking);

/**
 * @swagger
 * /admin/notes:
 *   get:
 *     summary: Get all uploaded notes
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of notes retrieved successfully
 */
router.get('/notes', adminAuthMiddleware, adminController.getAllNotes);

/**
 * @swagger
 * /admin/notes/{id}:
 *   get:
 *     summary: Get a note by ID with full details
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Note ID
 *     responses:
 *       200:
 *         description: Note details retrieved successfully
 */
router.get('/notes/:id', adminAuthMiddleware, adminController.getNoteById);

/**
 * @swagger
 * /admin/notes/{id}:
 *   delete:
 *     summary: Delete a note by ID
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Note ID
 *     responses:
 *       200:
 *         description: Note deleted successfully
 */
router.delete('/notes/:id', adminAuthMiddleware, adminController.deleteNote);

/**
 * @swagger
 * /admin/aptitude-attempts:
 *   get:
 *     summary: Get all aptitude practice attempts
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of aptitude attempts retrieved successfully
 */
router.get('/aptitude-attempts', adminAuthMiddleware, adminController.getAllAptitudeAttempts);

/**
 * @swagger
 * /admin/aptitude-attempts/{id}:
 *   get:
 *     summary: Get an aptitude attempt by ID with full details
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Aptitude attempt ID
 *     responses:
 *       200:
 *         description: Aptitude attempt retrieved successfully
 */
router.get('/aptitude-attempts/:id', adminAuthMiddleware, adminController.getAptitudeAttemptById);

/**
 * @swagger
 * /admin/aptitude-attempts/{id}:
 *   delete:
 *     summary: Delete an aptitude attempt by ID
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Aptitude attempt ID
 *     responses:
 *       200:
 *         description: Aptitude attempt deleted successfully
 */
router.delete('/aptitude-attempts/:id', adminAuthMiddleware, adminController.deleteAptitudeAttempt);

/**
 * @swagger
 * /admin/courses:
 *   get:
 *     summary: Get all courses
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of courses retrieved successfully
 */
router.get('/courses', adminAuthMiddleware, adminController.getAllCourses);

/**
 * @swagger
 * /admin/courses/{id}:
 *   get:
 *     summary: Get course by ID
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Course retrieved successfully
 */
router.get('/courses/:id', adminAuthMiddleware, adminController.getCourseById);

/**
 * @swagger
 * /admin/courses/{id}:
 *   put:
 *     summary: Update course by ID
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Course updated successfully
 */
router.put('/courses/:id', adminAuthMiddleware, adminController.updateCourse);

/**
 * @swagger
 * /admin/courses/{id}:
 *   delete:
 *     summary: Delete course by ID
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Course deleted successfully
 */
router.delete('/courses/:id', adminAuthMiddleware, adminController.deleteCourse);

/**
 * @swagger
 * /admin/notifications/{id}:
 *   get:
 *     summary: Get notifications for a user or expert by ID
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User or expert ID
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [read, unread]
 *       - in: query
 *         name: includeCleared
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: audience
 *         schema:
 *           type: string
 *           enum: [student, expert, both]
 *     responses:
 *       200:
 *         description: Notifications retrieved successfully
 */
router.get('/notifications/:id', adminAuthMiddleware, notificationController.listNotificationsByUserId);

// ---- Feedback moderation ---------------------------------------------------
router.get('/feedback', adminAuthMiddleware, feedbackController.listAllFeedback);
router.patch('/feedback/:id', adminAuthMiddleware, feedbackController.setFeedbackApproval);
router.delete('/feedback/:id', adminAuthMiddleware, feedbackController.deleteFeedback);

module.exports = router;
