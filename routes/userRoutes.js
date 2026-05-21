const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authMiddleware } = require('../middleware/authMiddleware');

// Public: list of distinct colleges for the TrustBar (no auth)
router.get('/colleges', userController.getColleges);

// Public: aggregate counts for the landing-page TrustBar (no auth, no PII)
router.get('/stats', userController.getPublicStats);

// All routes below require authentication
router.use(authMiddleware);

// Get user profile with interview data
router.get('/profile', userController.getProfile);

// User statistics
router.get('/statistics', userController.getStatistics);

// Interview routes
router.get('/interviews', userController.getInterviewHistory);
router.get('/interviews/:id', userController.getInterview);
router.get('/booked-experts', userController.getBookedInterviews);
router.post('/save-interview', userController.saveInterview);

// Settings
router.put('/settings', userController.updateSettings);

module.exports = router;