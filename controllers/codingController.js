const CodingSubmission = require('../models/CodingSubmission');

const MAX_CODE_LENGTH = 20000;
const VALID_STATUSES = ['accepted', 'wrong', 'error', 'timeout'];

const codingController = {
  async createSubmission(req, res) {
    try {
      const {
        problemId,
        problemTitle = '',
        problemDifficulty = '',
        language = 'javascript',
        code = '',
        status = 'wrong',
        passedCount = 0,
        totalCount = 0,
        errorMessage = '',
        results = []
      } = req.body || {};

      if (!problemId || typeof problemId !== 'string') {
        return res.status(400).json({ success: false, error: 'problemId is required' });
      }
      if (typeof code !== 'string' || !code.trim()) {
        return res.status(400).json({ success: false, error: 'code is required' });
      }
      if (code.length > MAX_CODE_LENGTH) {
        return res.status(400).json({ success: false, error: 'Submission too large' });
      }

      const safeStatus = VALID_STATUSES.includes(status) ? status : 'wrong';
      const safeResults = Array.isArray(results)
        ? results.slice(0, 50).map((r, i) => ({
            index: Number.isFinite(r?.index) ? r.index : i,
            visible: !!r?.visible,
            pass: !!r?.pass,
            error: typeof r?.error === 'string' ? r.error.slice(0, 500) : '',
            durationMs: Number.isFinite(r?.durationMs) ? r.durationMs : 0
          }))
        : [];

      const submission = await CodingSubmission.create({
        userId: req.user._id,
        problemId: problemId.slice(0, 80),
        problemTitle: String(problemTitle).slice(0, 200),
        problemDifficulty: String(problemDifficulty).slice(0, 20),
        language: String(language).slice(0, 30),
        code,
        status: safeStatus,
        passedCount: Math.max(0, parseInt(passedCount, 10) || 0),
        totalCount: Math.max(0, parseInt(totalCount, 10) || 0),
        errorMessage: String(errorMessage).slice(0, 1000),
        results: safeResults
      });

      res.status(201).json({ success: true, submission });
    } catch (error) {
      console.error('Create coding submission error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  },

  async getSubmissions(req, res) {
    try {
      const { problemId, limit = 20 } = req.query;
      const safeLimit = Math.min(parseInt(limit, 10) || 20, 100);

      const filter = { userId: req.user._id };
      if (problemId) filter.problemId = String(problemId);

      const submissions = await CodingSubmission.find(filter)
        .sort({ createdAt: -1 })
        .limit(safeLimit)
        .select('-__v -results');

      res.status(200).json({ success: true, submissions });
    } catch (error) {
      console.error('Get coding submissions error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  },

  async getSubmission(req, res) {
    try {
      const submission = await CodingSubmission.findOne({
        _id: req.params.id,
        userId: req.user._id
      }).select('-__v');

      if (!submission) {
        return res.status(404).json({ success: false, error: 'Submission not found' });
      }

      res.status(200).json({ success: true, submission });
    } catch (error) {
      console.error('Get coding submission error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  },

  async getStats(req, res) {
    try {
      const userId = req.user._id;
      const [totalAccepted, distinctSolved, total] = await Promise.all([
        CodingSubmission.countDocuments({ userId, status: 'accepted' }),
        CodingSubmission.distinct('problemId', { userId, status: 'accepted' }),
        CodingSubmission.countDocuments({ userId })
      ]);

      res.status(200).json({
        success: true,
        stats: {
          totalSubmissions: total,
          totalAccepted,
          problemsSolved: distinctSolved.length,
          solvedProblemIds: distinctSolved
        }
      });
    } catch (error) {
      console.error('Get coding stats error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
};

module.exports = codingController;
