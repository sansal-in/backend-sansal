const express = require('express');
const router = express.Router();
const feedbackController = require('../controllers/feedbackController');
const { authMiddleware } = require('../middleware/authMiddleware');

// Public — approved feedback for the landing-page Testimonials section.
router.get('/', feedbackController.listPublicFeedback);

// Authed — a logged-in user submits feedback after a session.
router.post('/', authMiddleware, feedbackController.submitFeedback);

module.exports = router;
