const mongoose = require('mongoose');
const Feedback = require('../models/Feedback');

const toObjectIdOrNull = (value) =>
  value && mongoose.Types.ObjectId.isValid(value) ? value : null;

const feedbackController = {
  // Authed: a user submits feedback. Saved as unapproved — admin must approve
  // before it surfaces on the public landing page.
  async submitFeedback(req, res) {
    try {
      const userId = req.user?._id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Not authenticated' });
      }

      const rating = Number(req.body?.rating);
      const quote = String(req.body?.quote || '').trim();
      const ALLOWED_SOURCES = [
        'interview',
        'expert-session',
        'expert-chat',
        'booking-confirmation',
        'course',
        'aptitude',
        'resume',
        'general',
      ];
      const source = ALLOWED_SOURCES.includes(req.body?.source) ? req.body.source : 'interview';
      // Accept an ObjectId only — anything else (e.g. a JS Date.now() timestamp
      // from the client's React state) is silently dropped to null.
      const interviewId = toObjectIdOrNull(req.body?.interviewId);
      const referenceId = String(req.body?.referenceId || '').trim().slice(0, 120);

      if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
        return res.status(400).json({ success: false, error: 'rating must be 1–5' });
      }
      if (quote.length < 10 || quote.length > 600) {
        return res.status(400).json({ success: false, error: 'quote must be 10–600 characters' });
      }

      const doc = await Feedback.create({
        userId,
        rating,
        quote,
        source,
        interviewId,
        referenceId,
        approved: false,
      });

      res.status(201).json({ success: true, feedback: { _id: doc._id } });
    } catch (error) {
      console.error('Submit feedback error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  },

  // Public: approved feedback only — used by the landing Testimonials section.
  async listPublicFeedback(req, res) {
    try {
      const limit = Math.min(parseInt(req.query.limit, 10) || 12, 50);

      const feedback = await Feedback.find({ approved: true })
        .sort({ approvedAt: -1, createdAt: -1 })
        .limit(limit)
        .populate('userId', 'displayName photoURL college title')
        .lean();

      const items = feedback
        .filter((f) => f.userId)
        .map((f) => ({
          _id: f._id,
          rating: f.rating,
          quote: f.quote,
          createdAt: f.createdAt,
          name: f.userId.displayName || 'Sansal student',
          photoURL: f.userId.photoURL || '',
          college: f.userId.college || '',
          role: f.userId.title || '',
        }));

      res.status(200).json({ success: true, feedback: items });
    } catch (error) {
      console.error('List public feedback error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  },

  // Admin: list every feedback (any status) for moderation.
  async listAllFeedback(req, res) {
    try {
      const feedback = await Feedback.find()
        .sort({ createdAt: -1 })
        .populate('userId', 'displayName email photoURL college')
        .lean();

      res.status(200).json({ success: true, feedback });
    } catch (error) {
      console.error('List all feedback error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  },

  // Admin: approve or unapprove a single feedback entry.
  async setFeedbackApproval(req, res) {
    try {
      const { id } = req.params;
      const approved = Boolean(req.body?.approved);

      const doc = await Feedback.findByIdAndUpdate(
        id,
        { approved, approvedAt: approved ? new Date() : null },
        { new: true },
      );
      if (!doc) return res.status(404).json({ success: false, error: 'Not found' });

      res.status(200).json({ success: true, feedback: doc });
    } catch (error) {
      console.error('Set feedback approval error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  },

  // Admin: delete a feedback entry.
  async deleteFeedback(req, res) {
    try {
      const { id } = req.params;
      const doc = await Feedback.findByIdAndDelete(id);
      if (!doc) return res.status(404).json({ success: false, error: 'Not found' });
      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Delete feedback error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  },
};

module.exports = feedbackController;
