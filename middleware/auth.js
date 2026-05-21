const admin = require('firebase-admin');
const jwt = require('jsonwebtoken');
const { verifyToken } = require('../utils/token');
const User = require('../models/User');
const Expert = require('../models/Expert');

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    })
  });
}

// Verify Firebase ID token
const verifyFirebaseToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }
    
    const token = authHeader.split(' ')[1];
    
    // Verify Firebase token
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    // Find or create user
    let user = await User.findOne({ firebaseUid: decodedToken.uid });
    
    if (!user) {
      // Auto-create user on first login
      user = await User.create({
        firebaseUid: decodedToken.uid,
        email: decodedToken.email,
        name: decodedToken.name || decodedToken.email.split('@')[0],
        avatar: decodedToken.picture || ''
      });
    }
    
    req.user = user;
    req.firebaseUser = decodedToken;
    next();
  } catch (error) {
    console.error('Auth error:', error);
    
    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({
        success: false,
        message: 'Token expired'
      });
    }
    
    return res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
};

// Verify Expert Firebase token
const verifyExpertToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }
    
    const token = authHeader.split(' ')[1];

    // Try Firebase token first
    try {
      const decodedToken = await admin.auth().verifyIdToken(token);
      
      const expert = await Expert.findOne({ firebaseUid: decodedToken.uid });
      if (!expert) {
        return res.status(403).json({
          success: false,
          message: 'Expert account not found'
        });
      }

      if (!expert.isActive) {
        return res.status(403).json({
          success: false,
          message: 'Expert account is deactivated'
        });
      }

      req.expert = expert;
      req.firebaseUser = decodedToken;
      return next();
    } catch (firebaseError) {
      // Fallback to backend JWT
      const decodedJwt = verifyToken(token);
      if (!decodedJwt) {
        return res.status(401).json({
          success: false,
          message: 'Invalid token'
        });
      }

      const user = await User.findById(decodedJwt.userId);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      const expert = await Expert.findOne({ user: user._id });
      
      if (!expert) {
        return res.status(403).json({
          success: false,
          message: 'Expert account not found'
        });
      }

      if (!expert.isActive) {
        return res.status(403).json({
          success: false,
          message: 'Expert account is deactivated'
        });
      }

      req.user = user;
      req.expert = expert;
      req.firebaseUser = null;
      return next();
    }
  } catch (error) {
    console.error('Expert auth error:', error);
    
    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({
        success: false,
        message: 'Token expired'
      });
    }
    
    return res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
};

// Optional authentication - doesn't fail if no token
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }
    
    const token = authHeader.split(' ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    const user = await User.findOne({ firebaseUid: decodedToken.uid });
    if (user) {
      req.user = user;
      req.firebaseUser = decodedToken;
    }
    
    next();
  } catch (error) {
    // Continue without user
    next();
  }
};

// Rate limiting by user
const rateLimitByUser = (maxRequests = 100, windowMs = 60000) => {
  const requests = new Map();
  
  return (req, res, next) => {
    const userId = req.user?._id?.toString() || req.ip;
    const now = Date.now();
    
    if (!requests.has(userId)) {
      requests.set(userId, []);
    }
    
    const userRequests = requests.get(userId).filter(
      time => now - time < windowMs
    );
    
    if (userRequests.length >= maxRequests) {
      return res.status(429).json({
        success: false,
        message: 'Too many requests, please try again later'
      });
    }
    
    userRequests.push(now);
    requests.set(userId, userRequests);
    
    next();
  };
};

module.exports = {
  verifyFirebaseToken,
  verifyExpertToken,
  optionalAuth,
  rateLimitByUser
};
