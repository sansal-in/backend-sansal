const { verifyToken } = require('../utils/token');
const User = require('../models/User');

const notesAuthMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'No token provided. Access denied.'
      });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token. Access denied.'
      });
    }

    if (decoded.userId === 'static_admin_id') {
      req.user = {
        _id: null,
        displayName: 'Admin',
        email: '',
        role: ['admin'],
        isActive: true
      };
      return next();
    }

    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found in database'
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        error: 'Account is deactivated'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Notes auth middleware error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

module.exports = { notesAuthMiddleware };
