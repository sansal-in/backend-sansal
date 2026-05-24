const AptitudeAttempt = require('../models/AptitudeAttempt');
const User = require('../models/User');
const { sendAptitudeResult } = require('../services/whatsappService');
const { sendAptitudeResultEmail } = require('../services/emailService');
const { createNotification } = require('../services/notificationService');

const normalizeAnswer = (answer = {}) => {
  const question = `${answer.question || ''}`.trim();
  const options = Array.isArray(answer.options) ? answer.options : [];
  const correctAnswer = `${answer.correctAnswer || ''}`.trim().toUpperCase();
  const selectedAnswer = `${answer.selectedAnswer || ''}`.trim().toUpperCase();
  const isCorrect =
    selectedAnswer && correctAnswer
      ? selectedAnswer === correctAnswer
      : Boolean(answer.isCorrect);

  if (!question || !correctAnswer) return null;

  return {
    question,
    options,
    correctAnswer,
    selectedAnswer,
    isCorrect
  };
};


const aptitudeController = {
  async createAttempt(req, res) {
    try {
      const { datasetId, datasetLabel, answers = [] } = req.body;

      const normalizedAnswers = Array.isArray(answers)
        ? answers.map(normalizeAnswer).filter(Boolean)
        : [];

      const totalQuestions = normalizedAnswers.length;
      const correctCount = normalizedAnswers.filter((item) => item.isCorrect).length;
      const incorrectCount = normalizedAnswers.filter(
        (item) => item.selectedAnswer && !item.isCorrect
      ).length;
      const unansweredCount = Math.max(
        totalQuestions - correctCount - incorrectCount,
        0
      );
      const scorePercent =
        totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

      const attempt = new AptitudeAttempt({
        userId: req.user._id,
        datasetId: datasetId || '',
        datasetLabel: datasetLabel || '',
        totalQuestions,
        correctCount,
        incorrectCount,
        unansweredCount,
        scorePercent,
        answers: normalizedAnswers
      });

      await attempt.save();

      // Send WhatsApp result (only if user has phone in bio) — fire and forget
      (async () => {
        try {
          const user = await User.findById(req.user._id).select('phone displayName').lean();
          if (user && user.phone && user.phone.trim()) {
            await sendAptitudeResult(user.phone, user.displayName || 'Student', {
              datasetLabel: datasetLabel || '',
              scorePercent,
              correctCount,
              totalQuestions,
              incorrectCount,
              unansweredCount
            });
          }
        } catch (err) {
          console.error('Aptitude WhatsApp send failed:', err.message);
        }
      })();

      // Send email result (user + admin) — fire and forget
      (async () => {
        try {
          const user = await User.findById(req.user._id)
            .select('email displayName college')
            .lean();
          if (user && user.email) {
            await sendAptitudeResultEmail({ user, attempt });
          }
        } catch (err) {
          console.error('Aptitude email send failed:', err.message);
        }
      })();

      // In-app notification
      createNotification({
        userId: req.user._id,
        type: 'aptitude_completed',
        audience: 'student',
        title: 'Aptitude test result',
        message: `You scored ${scorePercent}% (${correctCount}/${totalQuestions}) on ${datasetLabel || 'the aptitude test'}.`,
        data: {
          attemptId: attempt._id,
          datasetId,
          datasetLabel,
          scorePercent,
          correctCount,
          totalQuestions
        }
      }).catch(err => console.error('Aptitude notification error:', err.message));

      res.status(201).json({
        success: true,
        attempt
      });
    } catch (error) {
      console.error('Create aptitude attempt error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },

  async getAttempts(req, res) {
    try {
      const { limit = 10 } = req.query;
      const safeLimit = Math.min(parseInt(limit, 10) || 10, 50);

      const attempts = await AptitudeAttempt.find({ userId: req.user._id })
        .sort({ createdAt: -1 })
        .limit(safeLimit)
        .select('-__v');

      res.status(200).json({
        success: true,
        attempts
      });
    } catch (error) {
      console.error('Get aptitude attempts error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },

  async getAttempt(req, res) {
    try {
      const attempt = await AptitudeAttempt.findOne({
        _id: req.params.id,
        userId: req.user._id
      }).select('-__v');

      if (!attempt) {
        return res.status(404).json({
          success: false,
          error: 'Aptitude attempt not found'
        });
      }

      res.status(200).json({
        success: true,
        attempt
      });
    } catch (error) {
      console.error('Get aptitude attempt error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
};

module.exports = aptitudeController;
