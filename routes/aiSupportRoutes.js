const express = require('express');
const rateLimit = require('express-rate-limit');
const { verifyToken } = require('../utils/token');
const User = require('../models/User');
const { chat } = require('../controllers/aiSupportController');

const router = express.Router();

// Optional auth: if a valid Bearer token is sent, attach req.user. If not,
// silently continue as a guest (general help still works, but personal data
// queries will be answered with "please sign in to see your bookings").
async function optionalAuth(req, _res, next) {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return next();
    const decoded = verifyToken(token);
    if (!decoded?.userId) return next();
    const user = await User.findById(decoded.userId);
    if (user && user.isActive !== false) {
      req.user = user;
    }
  } catch {
    // ignore — treat as guest
  }
  next();
}

// Tighter limit than the global one — chat is more expensive than typical routes.
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'You are sending messages too fast. Please slow down.' },
});

router.post('/chat', chatLimiter, optionalAuth, chat);

module.exports = router;
