const express = require('express');
const router = express.Router();
const {
  createInterview,
  getInterviews,
  generateQuestion,
  scoreAnswer,
  getAnalytics,
  updateInterview
} = require('../controllers/interviewController');
const { authMiddleware } = require('../middleware/authMiddleware');

router.post('/', authMiddleware, createInterview);
router.get('/', authMiddleware, getInterviews);
router.put('/:id', authMiddleware, updateInterview);
router.post('/generate-question', authMiddleware, generateQuestion);
router.post('/score-answer', authMiddleware, scoreAnswer);
router.post('/analytics', authMiddleware, getAnalytics);

module.exports = router;