const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authMiddleware } = require('../middleware/authMiddleware');
const { avatarUpload } = require('../middleware/avatarUpload');
const User = require('../models/User');
const Expert = require('../models/Expert');
const { verifyFirebaseToken } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorMiddleware');

// Public routes
router.post('/login', authController.login);
router.post('/login-email', authController.loginEmail);
router.post('/signup-email', authController.signupEmail);

// OTP routes (public)
router.post('/send-otp', authController.sendOtp);
router.post('/verify-signup-otp', authController.verifySignupOtp);
router.post('/verify-forgot-password-otp', authController.verifyForgotPasswordOtp);
router.post('/reset-password', authController.resetPassword);

// Protected routes
router.get('/profile', authMiddleware, authController.getProfile);
router.post('/verify-email', authMiddleware, authController.sendVerificationEmail);
router.post('/profile-photo', authMiddleware, avatarUpload.single('file'), authController.uploadProfilePhoto);
router.put('/profile', authMiddleware, authController.updateProfile);
router.delete('/profile', authMiddleware, authController.deleteAccount);
router.get('/verification-status', authMiddleware, authController.checkVerification);
router.post('/logout', authMiddleware, authController.logout);
router.post('/change-password', authMiddleware, authController.changePassword);
router.put('/college', authMiddleware, authController.updateCollege);

router.put('/me', verifyFirebaseToken, asyncHandler(async (req, res) => {
  const { name, phone, avatar } = req.body;
  
  const user = await User.findByIdAndUpdate(
    req.user._id,
    { name, phone, avatar },
    { returnDocument: 'after', runValidators: true }
  );
  
  res.status(200).json({
    success: true,
    data: user
  });
}));

/**
 * @desc    Check if user is also an expert
 * @route   GET /api/auth/check-expert
 * @access  Private
 */
router.get('/check-expert', verifyFirebaseToken, asyncHandler(async (req, res) => {
  const expert = await Expert.findOne({ firebaseUid: req.firebaseUser.uid });
  
  res.status(200).json({
    success: true,
    isExpert: !!expert,
    expert: expert || null
  });
}));

module.exports = router;
