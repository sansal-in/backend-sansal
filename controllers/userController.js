const User = require('../models/User');
const Interview = require('../models/Interview');
const Expert = require('../models/Expert');
const Booking = require('../models/Booking');

const userController = {
  // Public: aggregate totals for the landing-page TrustBar (no auth, no PII).
  async getPublicStats(req, res) {
    try {
      const [totalUsers, totalInterviews, collegeRows] = await Promise.all([
        User.countDocuments(),
        Interview.countDocuments(),
        User.aggregate([
          { $match: { college: { $type: 'string', $ne: '' } } },
          {
            $group: {
              _id: { $toLower: { $trim: { input: '$college' } } },
            },
          },
          { $count: 'count' },
        ]),
      ]);

      const totalColleges = collegeRows?.[0]?.count || 0;

      res.status(200).json({
        success: true,
        stats: { totalUsers, totalInterviews, totalColleges },
      });
    } catch (error) {
      console.error('Get public stats error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  },

  // Public: distinct list of college names for the TrustBar
  async getColleges(req, res) {
    try {
      const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);

      const colleges = await User.aggregate([
        { $match: { college: { $type: 'string', $ne: '' } } },
        {
          $project: {
            normalized: {
              $toLower: {
                $reduce: {
                  input: { $split: [{ $trim: { input: '$college' } }, ' '] },
                  initialValue: '',
                  in: {
                    $cond: [
                      { $eq: ['$$value', ''] },
                      '$$this',
                      {
                        $cond: [
                          { $eq: ['$$this', ''] },
                          '$$value',
                          { $concat: ['$$value', ' ', '$$this'] }
                        ]
                      }
                    ]
                  }
                }
              }
            },
            display: { $trim: { input: '$college' } }
          }
        },
        { $match: { normalized: { $ne: '' } } },
        {
          $group: {
            _id: '$normalized',
            name: { $first: '$display' },
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1, _id: 1 } },
        { $limit: limit },
        { $project: { _id: 0, name: 1, count: 1 } }
      ]);

      res.status(200).json({
        success: true,
        colleges
      });
    } catch (error) {
      console.error('Get colleges error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },

  // Get user statistics
  async getStatistics(req, res) {
    try {
      const userId = req.user._id;
      
      // Get user with statistics
      const user = await User.findById(userId)
        .select('interviewsCompleted averageScore totalScore lastLogin');
      
      // Get recent interviews
      const interviews = await Interview.find({ userId })
        .sort({ completedAt: -1 })
        .limit(5)
        .select('role company difficulty totalScore timeSpent completedAt');
      
      // Calculate success rate
      const totalInterviews = user.interviewsCompleted;
      const successfulInterviews = await Interview.countDocuments({
        userId,
        totalScore: { $gte: 70 }
      });
      
      const successRate = totalInterviews > 0 
        ? Math.round((successfulInterviews / totalInterviews) * 100) 
        : 0;
      
      // Calculate total time
      const timeAggregation = await Interview.aggregate([
        { $match: { userId: userId } },
        { $group: { _id: null, totalTime: { $sum: "$timeSpent" } } }
      ]);
      
      const totalTime = timeAggregation[0]?.totalTime || 0;
      
      res.status(200).json({
        success: true,
        statistics: {
          interviewsCompleted: user.interviewsCompleted,
          averageScore: user.averageScore,
          successRate,
          totalTime,
          totalScore: user.totalScore,
          lastLogin: user.lastLogin,
          recentInterviews: interviews
        }
      });
    } catch (error) {
      console.error('Get statistics error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },

  // Get user interview history
  async getInterviewHistory(req, res) {
    try {
      const { page = 1, limit = 10, sortBy = '-completedAt' } = req.query;
      const skip = (page - 1) * limit;
      
      const interviews = await Interview.find({ userId: req.user._id })
        .sort(sortBy)
        .skip(skip)
        .limit(parseInt(limit))
        .select('-__v -updatedAt');
      
      const total = await Interview.countDocuments({ userId: req.user._id });
      
      res.status(200).json({
        success: true,
        interviews,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error('Get interview history error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },

  // Get specific interview
  async getInterview(req, res) {
    try {
      const interview = await Interview.findOne({
        _id: req.params.id,
        userId: req.user._id
      });
      
      if (!interview) {
        return res.status(404).json({
          success: false,
          error: 'Interview not found'
        });
      }
      
      res.status(200).json({
        success: true,
        interview
      });
    } catch (error) {
      console.error('Get interview error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },

  // Save interview result
  async saveInterview(req, res) {
    try {
      const {
        role,
        company,
        difficulty,
        experience,
        totalQuestions,
        timeSpent,
        totalScore,
        breakdown,
        feedback,
        transcript,
        recordingUrl,
        status
      } = req.body;
      
      const interview = new Interview({
        userId: req.user._id,
        firebaseUid: req.firebaseUid,
        role,
        company,
        difficulty,
        experience,
        totalQuestions,
        timeSpent,
        totalScore,
        breakdown,
        feedback,
        transcript,
        recordingUrl,
        status: status || 'completed',
        completedAt: new Date()
      });
      
      await interview.save();
      
      // Update user statistics
      await User.findByIdAndUpdate(req.user._id, {
        $inc: { 
          interviewsCompleted: 1,
          totalScore: totalScore
        }
      });
      
      // Recalculate average score
      const user = await User.findById(req.user._id);
      user.averageScore = user.totalScore / user.interviewsCompleted;
      await user.save();
      
      res.status(201).json({
        success: true,
        interview,
        message: 'Interview saved successfully'
      });
    } catch (error) {
      console.error('Save interview error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },

  // Update user settings
  async updateSettings(req, res) {
    try {
      const { settings } = req.body;
      
      const user = await User.findByIdAndUpdate(
        req.user._id,
        { 
          $set: { 
            settings: { ...req.user.settings, ...settings }
          }
        },
        { returnDocument: 'after' }
      ).select('settings');
      
      res.status(200).json({
        success: true,
        settings: user.settings,
        message: 'Settings updated successfully'
      });
    } catch (error) {
      console.error('Update settings error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },

  // Get user profile with all interview data
  async getProfile(req, res) {
    try {
      const user = await User
        .findById(req.user._id);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      // Get all interviews for this user
      const interviews = await Interview.find({ userId: req.user._id })
        .sort({ completedAt: -1 })
        .select('config totalScore timeSpent completed completedAt createdAt');

      res.status(200).json({
        success: true,
        user: {
          _id: user._id,
          firebaseUid: user.firebaseUid,
          email: user.email,
          displayName: user.displayName,
          phone: user.phone,
          photoURL: user.photoURL,
          title: user.title,
          bio: user.bio,
          location: user.location,
          linkedin: user.linkedin,
          github: user.github,
          leetcode: user.leetcode,
          portfolio: user.portfolio,
          college: user.college,
          provider: user.provider,
          emailVerified: user.emailVerified,
          role: user.role,
          interviewsCompleted: user.interviewsCompleted,
          totalScore: user.totalScore,
          averageScore: user.averageScore,
          subscription: user.subscription,
          totalBookings: user.totalBookings,
          totalSpent: user.totalSpent,
          isActive: user.isActive,
          settings: user.settings,
          accountCreated: user.accountCreated,
          lastLogin: user.lastLogin,
          interviews: interviews
        }
      });
    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },

  // Get booked expert sessions for the user
  async getBookedInterviews(req, res) {
    try {
      const bookings = await Booking.find({
        userId: req.user._id
      })
      .populate({
        path: 'expertId',
        populate: { path: 'user', select: 'displayName email photoURL' }
      })
      .sort({ 'slot.date': 1, 'slot.startTime': 1 });

      res.status(200).json({
        success: true,
        bookings
      });
    } catch (error) {
      console.error('Get booked interviews error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },

  // Book an expert
  async bookExpert(req, res) {
    try {
      const { expertId, scheduledAt, duration, notes } = req.body;

      if (!expertId || !scheduledAt) {
        return res.status(400).json({
          success: false,
          error: 'Expert ID and scheduled time are required'
        });
      }

      const expert = await Expert.findById(expertId);
      if (!expert) {
        return res.status(404).json({
          success: false,
          error: 'Expert not found'
        });
      }
      
      if (expert.user?.toString() === req.user._id.toString()) {
        return res.status(400).json({
          success: false,
          error: 'You cannot book your own session'
        });
      }

      const interview = new Interview({
        userId: req.user._id,
        expertId,
        scheduledAt,
        config: {
          duration: duration || 60,
          role: 'Expert Interview'
        },
        status: 'scheduled',
        questions: notes ? [{ question: { text: 'User Notes' }, answer: notes }] : []
      });

      await interview.save();

      res.status(201).json({
        success: true,
        message: 'Expert booked successfully',
        booking: interview
      });
    } catch (error) {
      console.error('Book expert error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
};

module.exports = userController;
