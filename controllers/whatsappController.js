const User = require('../models/User');
const Interview = require('../models/Interview');
const AptitudeAttempt = require('../models/AptitudeAttempt');
const CourseEnrollment = require('../models/CourseEnrollment');
const {
  sendWhatsAppMessage,
  sendDailyTaskReminder,
  sendWeeklyProgress,
  sendPlacementAlert,
  sendInterviewScore
} = require('../services/whatsappService');

/**
 * Send a custom WhatsApp message to a specific user
 * POST /api/whatsapp/send
 * Admin only
 */
const sendMessageToUser = async (req, res) => {
  try {
    const { userId, message } = req.body;
    if (!userId || !message) {
      return res.status(400).json({ success: false, error: 'userId and message are required' });
    }

    const user = await User.findById(userId).select('phone displayName');
    if (!user || !user.phone) {
      return res.status(404).json({ success: false, error: 'User not found or no phone number' });
    }

    const result = await sendWhatsAppMessage(user.phone, message);
    res.json({ success: true, result });
  } catch (error) {
    console.error('WhatsApp send error:', error);
    res.status(500).json({ success: false, error: 'Failed to send message' });
  }
};

/**
 * Send bulk WhatsApp message to all users with phone numbers
 * POST /api/whatsapp/broadcast
 * Admin only
 */
const broadcastMessage = async (req, res) => {
  try {
    const { message, filter } = req.body;
    if (!message) {
      return res.status(400).json({ success: false, error: 'message is required' });
    }

    // Build query — only users with phone numbers
    const query = { phone: { $exists: true, $ne: '' } };
    if (filter?.role) query.role = filter.role;

    const users = await User.find(query).select('phone displayName').lean();

    let sent = 0;
    let failed = 0;
    const errors = [];

    // Send with delay to respect rate limits (80 messages/second for WhatsApp Business API)
    for (const user of users) {
      try {
        const personalMessage = message.replace('{{name}}', user.displayName || 'Student');
        const result = await sendWhatsAppMessage(user.phone, personalMessage);
        if (result.success) sent++;
        else failed++;
      } catch (e) {
        failed++;
        errors.push({ userId: user._id, error: e.message });
      }

      // Small delay to avoid rate limiting
      if (sent % 50 === 0) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    res.json({ success: true, total: users.length, sent, failed, errors: errors.slice(0, 10) });
  } catch (error) {
    console.error('WhatsApp broadcast error:', error);
    res.status(500).json({ success: false, error: 'Broadcast failed' });
  }
};

/**
 * Send daily task reminders to all active users
 * POST /api/whatsapp/daily-reminders
 * Called by cron job or admin
 */
const sendDailyReminders = async (req, res) => {
  try {
    const users = await User.find({
      phone: { $exists: true, $ne: '' },
      'settings.emailNotifications': { $ne: false }
    }).select('phone displayName interviewsCompleted').lean();

    const tasks = [
      'Take a 15-min mock interview',
      'Solve 5 aptitude questions',
      'Review your resume and update 1 section',
      'Watch 1 course lesson',
      'Practice 1 coding problem',
      'Read community notes for 10 minutes',
      'Take a mock interview for your dream company role'
    ];

    const todayTask = tasks[new Date().getDay()]; // Different task each day
    let sent = 0;

    for (const user of users) {
      try {
        const streak = user.interviewsCompleted || 0; // Simplified streak
        await sendDailyTaskReminder(
          user.phone,
          user.displayName || 'Student',
          todayTask,
          streak
        );
        sent++;
      } catch (e) {
        // Continue with other users
      }

      if (sent % 50 === 0) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    res.json({ success: true, sent, total: users.length });
  } catch (error) {
    console.error('Daily reminders error:', error);
    res.status(500).json({ success: false, error: 'Failed to send reminders' });
  }
};

/**
 * Send weekly progress reports to all users
 * POST /api/whatsapp/weekly-reports
 * Called by cron job or admin
 */
const sendWeeklyReports = async (req, res) => {
  try {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const users = await User.find({
      phone: { $exists: true, $ne: '' }
    }).select('phone displayName').lean();

    let sent = 0;

    for (const user of users) {
      try {
        // Get weekly stats for this user
        const weeklyInterviews = await Interview.countDocuments({
          userId: user._id,
          createdAt: { $gte: oneWeekAgo }
        });

        const interviews = await Interview.find({
          userId: user._id,
          createdAt: { $gte: oneWeekAgo },
          totalScore: { $exists: true }
        }).select('totalScore').lean();

        const avgScore = interviews.length > 0
          ? Math.round(interviews.reduce((sum, i) => sum + (i.totalScore || 0), 0) / interviews.length)
          : 0;

        const aptitudeTests = await AptitudeAttempt.countDocuments({
          userId: user._id,
          createdAt: { $gte: oneWeekAgo }
        });

        const enrollments = await CourseEnrollment.find({
          userId: user._id
        }).select('progressPercent').lean();

        const courseProgress = enrollments.length > 0
          ? Math.round(enrollments.reduce((sum, e) => sum + (e.progressPercent || 0), 0) / enrollments.length)
          : 0;

        // Simple readiness calculation
        const readiness = Math.min(100, Math.round(
          (weeklyInterviews * 5) + (avgScore * 0.3) + (aptitudeTests * 3) + (courseProgress * 0.2)
        ));

        await sendWeeklyProgress(user.phone, user.displayName || 'Student', {
          interviews: weeklyInterviews,
          avgScore,
          aptitudeTests,
          courseProgress,
          readiness
        });

        sent++;
      } catch (e) {
        // Continue with other users
      }

      if (sent % 30 === 0) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    res.json({ success: true, sent, total: users.length });
  } catch (error) {
    console.error('Weekly reports error:', error);
    res.status(500).json({ success: false, error: 'Failed to send reports' });
  }
};

/**
 * Send placement drive alert to all users
 * POST /api/whatsapp/placement-alert
 * Admin only
 */
const sendPlacementDriveAlert = async (req, res) => {
  try {
    const { companyName, deadline } = req.body;
    if (!companyName || !deadline) {
      return res.status(400).json({ success: false, error: 'companyName and deadline are required' });
    }

    const users = await User.find({
      phone: { $exists: true, $ne: '' }
    }).select('phone displayName').lean();

    let sent = 0;

    for (const user of users) {
      try {
        await sendPlacementAlert(
          user.phone,
          user.displayName || 'Student',
          companyName,
          deadline
        );
        sent++;
      } catch (e) {
        // Continue
      }

      if (sent % 50 === 0) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    res.json({ success: true, sent, total: users.length });
  } catch (error) {
    console.error('Placement alert error:', error);
    res.status(500).json({ success: false, error: 'Failed to send alerts' });
  }
};

module.exports = {
  sendMessageToUser,
  broadcastMessage,
  sendDailyReminders,
  sendWeeklyReports,
  sendPlacementDriveAlert
};
