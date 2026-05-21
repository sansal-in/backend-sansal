const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const {
  sendMessageToUser,
  broadcastMessage,
  sendDailyReminders,
  sendWeeklyReports,
  sendPlacementDriveAlert
} = require('../controllers/whatsappController');

// Admin auth middleware (same pattern as AdminRoutes)
const adminAuthMiddleware = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const id = decoded.id || decoded._id || decoded.userId;

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

// All routes are admin-only
router.use(adminAuthMiddleware);

// Send message to single user
router.post('/send', sendMessageToUser);

// Broadcast message to all users (supports {{name}} placeholder)
router.post('/broadcast', broadcastMessage);

// Send daily task reminders (call via cron or manually)
router.post('/daily-reminders', sendDailyReminders);

// Send weekly progress reports (call via cron or manually)
router.post('/weekly-reports', sendWeeklyReports);

// Send placement drive alert to all users
router.post('/placement-alert', sendPlacementDriveAlert);

module.exports = router;
