const { verifyToken } = require('../utils/token');
const User = require('../models/User');
const { hasRole } = require('../utils/roleUtils');

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'No token provided. Access denied.'
      });
    }

    // Verify Backend token
    const decoded = verifyToken(token);
    
    if (!decoded) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token. Access denied.'
      });
    }

    // Get user from database
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

    // Attach user to request
    req.user = user;
    req.firebaseUid = user.firebaseUid;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

// Admin middleware
const adminMiddleware = async (req, res, next) => {
  if (!hasRole(req.user, 'admin')) {
    return res.status(403).json({
      success: false,
      error: 'Access denied. Admin only.'
    });
  }
  next();
};

module.exports = { authMiddleware, adminMiddleware };
