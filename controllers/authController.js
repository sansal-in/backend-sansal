const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const FirebaseService = require('../services/firebaseService');
const User = require('../models/User');
const Otp = require('../models/Otp');
const { generateToken } = require('../utils/token'); // We'll create this
const { auth } = require('../config/firebaseAdmin');
const { sendOtpEmail, sendWelcomeEmail } = require('../services/emailService');

const authController = {
  // Login/Register with Firebase token
  async login(req, res) {
    try {
      const { token } = req.body;
      
      if (!token) {
        return res.status(400).json({
          success: false,
          error: 'Firebase token is required'
        });
      }

      // Verify Firebase token
      const decoded = await FirebaseService.verifyToken(token);
      
      if (!decoded.success) {
        return res.status(401).json({
          success: false,
          error: 'Invalid token'
        });
      }

      // Sync user data from Firebase to MongoDB
      const syncResult = await FirebaseService.syncUserFromFirebase({
        uid: decoded.uid,
        email: decoded.email,
        name: decoded.name,
        picture: decoded.picture,
        emailVerified: true // From token verification
      });

      if (!syncResult.success) {
        return res.status(500).json({
          success: false,
          error: 'Failed to sync user data'
        });
      }

      // Fire-and-forget welcome email on first sign-in
      if (syncResult.isNewUser) {
        sendWelcomeEmail(syncResult.user).catch((err) => {
          console.error('Welcome email failed:', err?.message || err);
        });
      }

      // Generate JWT token for our backend
      const backendToken = generateToken(syncResult.user._id);

      res.status(200).json({
        success: true,
        token: backendToken,
        isNewUser: syncResult.isNewUser,
        user: {
          id: syncResult.user._id,
          firebaseUid: syncResult.user.firebaseUid,
          email: syncResult.user.email,
          displayName: syncResult.user.displayName,
          photoURL: syncResult.user.photoURL,
          college: syncResult.user.college,
          role: syncResult.user.role,
          emailVerified: syncResult.user.emailVerified,
          interviewsCompleted: syncResult.user.interviewsCompleted,
          averageScore: syncResult.user.averageScore,
          subscription: syncResult.user.subscription
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },

  // Login with Email and Password (Dev Option)
  async loginEmail(req, res) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          error: 'Email and password are required'
        });
      }

      // Find user by email in MongoDB
      const user = await User.findOne({ email });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      // Generate JWT token for our backend
      const token = generateToken(user._id);

      res.status(200).json({
        success: true,
        token,
        user: {
          id: user._id,
          firebaseUid: user.firebaseUid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          role: user.role,
          emailVerified: user.emailVerified,
          interviewsCompleted: user.interviewsCompleted,
          averageScore: user.averageScore,
          subscription: user.subscription
        }
      });
    } catch (error) {
      console.error('Login email error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },

  // Signup with Email and Password (Dev Option)
  async signupEmail(req, res) {
    try {
      const { email, password, displayName } = req.body;

      if (!email || !password || !displayName) {
        return res.status(400).json({
          success: false,
          error: 'Email, password, and display name are required'
        });
      }

      // Create user in Firebase Authentication
      const firebaseUserRecord = await auth.createUser({
        email,
        password,
        displayName,
      });

      // Sync user data from Firebase to MongoDB. This will create the user in our database.
      const syncResult = await FirebaseService.syncUserFromFirebase({
        uid: firebaseUserRecord.uid,
        email: firebaseUserRecord.email,
        name: firebaseUserRecord.displayName,
        picture: firebaseUserRecord.photoURL,
        emailVerified: firebaseUserRecord.emailVerified
      });

      if (!syncResult.success) {
        // This case is tricky. The user is created in Firebase Auth but not in our DB.
        // For now, we'll just return an error. A more robust solution might delete
        // the user from Firebase Auth to allow a retry.
        return res.status(500).json({
          success: false,
          error: 'Failed to sync user data to local database'
        });
      }

      // Fire-and-forget welcome email on first sign-up
      if (syncResult.isNewUser) {
        sendWelcomeEmail(syncResult.user).catch((err) => {
          console.error('Welcome email failed:', err?.message || err);
        });
      }

      // Generate JWT token for our backend
      const backendToken = generateToken(syncResult.user._id);

      res.status(201).json({
        success: true,
        token: backendToken,
        user: syncResult.user
      });
    } catch (error) {
      // Handle Firebase Admin SDK errors
      if (error.code === 'auth/email-already-exists') {
        return res.status(400).json({
          success: false,
          error: 'Email already in use'
        });
      }
      if (error.code === 'auth/invalid-password') {
        return res.status(400).json({ success: false, error: error.message });
      }
      console.error('Signup email error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },

  // Get current user profile
  async getProfile(req, res) {
    try {
      const user = await User.findById(req.user._id)
        .select('-__v -createdAt -updatedAt')
        .lean();

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      res.status(200).json({
        success: true,
        user
      });
    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },

  // Update user profile
  async updateProfile(req, res) {
    try {
      const {
        displayName,
        photoURL,
        phone,
        title,
        bio,
        location,
        linkedin,
        github,
        leetcode,
        portfolio,
        settings
      } = req.body;
      const updates = {};

      if (displayName !== undefined) updates.displayName = displayName;
      if (photoURL !== undefined) updates.photoURL = photoURL;
      if (phone !== undefined) updates.phone = phone;
      if (title !== undefined) updates.title = title;
      if (bio !== undefined) updates.bio = bio;
      if (location !== undefined) updates.location = location;
      if (linkedin !== undefined) updates.linkedin = linkedin;
      if (github !== undefined) updates.github = github;
      if (leetcode !== undefined) updates.leetcode = leetcode;
      if (portfolio !== undefined) updates.portfolio = portfolio;
      if (settings) updates.settings = { ...req.user.settings, ...settings };

      // Update in MongoDB
      const user = await User.findByIdAndUpdate(
        req.user._id,
        { $set: updates },
        { returnDocument: 'after', runValidators: true }
      ).select('-__v -createdAt -updatedAt');

      // Update in Firebase if displayName or photoURL changed
      const firebaseUpdates = {};
      if (displayName !== undefined) firebaseUpdates.displayName = displayName;
      if (photoURL !== undefined) firebaseUpdates.photoURL = photoURL;

      if (Object.keys(firebaseUpdates).length > 0) {
        await FirebaseService.updateFirebaseProfile(req.firebaseUid, firebaseUpdates);
      }

      res.status(200).json({
        success: true,
        user,
        message: 'Profile updated successfully'
      });
    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },

  // Upload profile photo
  async uploadProfilePhoto(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'Photo file is required'
        });
      }

      const photoURL = req.file.secure_url || req.file.path || '';

      if (!photoURL) {
        return res.status(500).json({
          success: false,
          error: 'Failed to upload photo'
        });
      }

      const user = await User.findByIdAndUpdate(
        req.user._id,
        { $set: { photoURL } },
        { returnDocument: 'after', runValidators: true }
      ).select('-__v -createdAt -updatedAt');

      if (req.firebaseUid) {
        await FirebaseService.updateFirebaseProfile(req.firebaseUid, { photoURL });
      }

      res.status(200).json({
        success: true,
        photoURL: user.photoURL,
        user,
        message: 'Profile photo updated successfully'
      });
    } catch (error) {
      console.error('Upload profile photo error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },

  // Update college name (called from CollegePromptModal after Google login)
  async updateCollege(req, res) {
    try {
      const { college } = req.body;

      if (!college || typeof college !== 'string' || college.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'College name is required'
        });
      }

      const trimmed = college.trim().slice(0, 200);

      const user = await User.findByIdAndUpdate(
        req.user._id,
        { $set: { college: trimmed } },
        { returnDocument: 'after', runValidators: true }
      ).select('-__v -createdAt -updatedAt');

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      res.status(200).json({
        success: true,
        college: user.college,
        user
      });
    } catch (error) {
      console.error('Update college error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },

  // Send verification email
  async sendVerificationEmail(req, res) {
    try {
      // Use email from request body (Swagger) or fall back to logged-in user's email
      const email = req.body.email || (req.user && req.user.email);

      if (!email) {
        return res.status(400).json({
          success: false,
          error: 'Email is required'
        });
      }

      // Handle Dev Users (skip Firebase call)
      if (req.firebaseUid && req.firebaseUid.startsWith('dev_')) {
        if (req.user && req.user._id) {
          await User.findByIdAndUpdate(req.user._id, {
            lastVerificationReminder: new Date()
          });
        }
        return res.status(200).json({
          success: true,
          message: 'Verification email sent (Simulated for Dev User)'
        });
      }

      const result = await FirebaseService.sendVerificationEmail(email);
      
      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error
        });
      }

      // Update last verification reminder time
      if (req.user && req.user._id) {
        await User.findByIdAndUpdate(req.user._id, {
          lastVerificationReminder: new Date()
        });
      }

      res.status(200).json({
        success: true,
        message: result.message
      });
    } catch (error) {
      console.error('Send verification email error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },

  // Check verification status
  async checkVerification(req, res) {
    const respondFromDb = (user) => {
      const creationTime = user.createdAt ? new Date(user.createdAt) : new Date();
      const now = new Date();
      const diffDays = Math.floor((now - creationTime) / (1000 * 60 * 60 * 24));
      const daysLeft = Math.max(0, 15 - diffDays);
      return res.status(200).json({
        success: true,
        emailVerified: !!user.emailVerified,
        daysLeft,
        showReminder: !user.emailVerified && (!user.lastVerificationReminder ||
          (new Date() - user.lastVerificationReminder) / (1000 * 60 * 60) >= 24)
      });
    };

    try {
      // Dev users or users without a Firebase UID — answer from the DB
      const isDevOrNoFirebase = !req.firebaseUid || req.firebaseUid.startsWith('dev_');
      if (isDevOrNoFirebase) {
        const user = req.firebaseUid
          ? await User.findOne({ firebaseUid: req.firebaseUid }).select('emailVerified lastVerificationReminder createdAt')
          : await User.findById(req.user._id).select('emailVerified lastVerificationReminder createdAt');
        if (!user) {
          return res.status(404).json({ success: false, error: 'User not found' });
        }
        return respondFromDb(user);
      }

      // Get fresh data from Firebase. If Firebase lookup fails (user deleted,
      // creds misconfigured, transient outage), fall back to DB data so the
      // app doesn't break for everyone.
      const { auth } = require('../config/firebaseAdmin');
      let firebaseUser;
      try {
        firebaseUser = await auth.getUser(req.firebaseUid);
      } catch (firebaseErr) {
        console.error('Firebase getUser failed for uid', req.firebaseUid, '-', firebaseErr.code || firebaseErr.message);
        const user = await User.findById(req.user._id).select('emailVerified lastVerificationReminder createdAt');
        if (!user) {
          return res.status(404).json({ success: false, error: 'User not found' });
        }
        return respondFromDb(user);
      }

      const user = await User.findOneAndUpdate(
        { firebaseUid: req.firebaseUid },
        { emailVerified: firebaseUser.emailVerified },
        { returnDocument: 'after' }
      ).select('emailVerified lastVerificationReminder createdAt');

      const creationTimeSource = firebaseUser.metadata && firebaseUser.metadata.creationTime
        ? firebaseUser.metadata.creationTime
        : user.createdAt;
      const creationTime = new Date(creationTimeSource);
      const now = new Date();
      const diffDays = Math.floor((now - creationTime) / (1000 * 60 * 60 * 24));
      const daysLeft = Math.max(0, 15 - diffDays);

      res.status(200).json({
        success: true,
        emailVerified: user.emailVerified,
        daysLeft,
        showReminder: !user.emailVerified && (!user.lastVerificationReminder ||
          (new Date() - user.lastVerificationReminder) / (1000 * 60 * 60) >= 24)
      });
    } catch (error) {
      console.error('Check verification error:', error && (error.stack || error.message || error));
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },

  // Delete user account
  async deleteAccount(req, res) {
    try {
      const userId = req.user._id;
      
      const user = await User.findByIdAndDelete(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Account deleted successfully'
      });
    } catch (error) {
      console.error('Delete account error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },

  // Logout (optional - mostly handled client-side)
  async logout(req, res) {
    try {
      // For Firebase, logout is client-side
      // Here we can update last login or do cleanup
      res.status(200).json({
        success: true,
        message: 'Logged out successfully'
      });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },

  // Send OTP for signup verification or forgot password
  async sendOtp(req, res) {
    try {
      const { email, purpose } = req.body;

      if (!email) {
        return res.status(400).json({ success: false, error: 'Email is required' });
      }

      if (!['signup', 'forgot-password'].includes(purpose)) {
        return res.status(400).json({ success: false, error: 'Invalid purpose' });
      }

      // For forgot-password, user must exist
      if (purpose === 'forgot-password') {
        const user = await User.findOne({ email });
        if (!user) {
          return res.status(404).json({ success: false, error: 'No account found with this email' });
        }
      }

      // Check resend cooldown (1 minute)
      const recentOtp = await Otp.findOne({
        email,
        purpose,
        createdAt: { $gt: new Date(Date.now() - 60 * 1000) }
      });

      if (recentOtp) {
        const secondsLeft = Math.ceil((recentOtp.createdAt.getTime() + 60000 - Date.now()) / 1000);
        return res.status(429).json({
          success: false,
          error: `Please wait ${secondsLeft} seconds before requesting a new OTP`,
          retryAfter: secondsLeft
        });
      }

      // Delete any existing OTPs for this email + purpose
      await Otp.deleteMany({ email, purpose });

      // Generate 6-digit OTP
      const otp = crypto.randomInt(100000, 999999).toString();

      // Save OTP (expires in 5 minutes)
      await Otp.create({
        email,
        otp,
        purpose,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000)
      });

      // Send OTP email
      const emailResult = await sendOtpEmail({ to: email, otp, purpose });

      console.log('[sendOtp] result for', email, '->', JSON.stringify({
        success: !!emailResult?.success,
        transport: emailResult?.transport || (emailResult?.id ? 'resend' : undefined),
        redirectedToAdmin: !!emailResult?.redirectedToAdmin,
        skipped: emailResult?.skipped || false,
        reason: emailResult?.reason,
        error: emailResult?.error
      }));

      if (emailResult?.error || emailResult?.skipped) {
        return res.status(500).json({
          success: false,
          error: 'Failed to send OTP email',
          detail: emailResult?.error || emailResult?.reason || 'unknown'
        });
      }

      if (emailResult?.redirectedToAdmin) {
        console.warn('[sendOtp] OTP for', email, 'was redirected to ADMIN inbox (EMAIL_REDIRECT_TO_ADMIN or sandbox FROM is active)');
      }

      res.status(200).json({
        success: true,
        message: 'OTP sent to your email',
        redirectedToAdmin: !!emailResult?.redirectedToAdmin
      });
    } catch (error) {
      console.error('Send OTP error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  },

  // Verify OTP for signup
  async verifySignupOtp(req, res) {
    try {
      const { email, otp } = req.body;

      if (!email || !otp) {
        return res.status(400).json({ success: false, error: 'Email and OTP are required' });
      }

      const otpRecord = await Otp.findOne({ email, purpose: 'signup' });

      if (!otpRecord) {
        return res.status(400).json({ success: false, error: 'OTP expired or not found. Please request a new one.' });
      }

      if (otpRecord.otp !== otp) {
        return res.status(400).json({ success: false, error: 'Invalid OTP' });
      }

      // OTP is valid — mark email as verified
      const user = await User.findOne({ email });
      if (user) {
        user.emailVerified = true;
        await user.save();

        // Also verify in Firebase
        if (user.firebaseUid) {
          try {
            await auth.updateUser(user.firebaseUid, { emailVerified: true });
          } catch (err) {
            console.error('Firebase email verify update failed:', err);
          }
        }
      }

      // Clean up OTP
      await Otp.deleteMany({ email, purpose: 'signup' });

      res.status(200).json({
        success: true,
        message: 'Email verified successfully'
      });
    } catch (error) {
      console.error('Verify signup OTP error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  },

  // Verify OTP for forgot password and reset
  async verifyForgotPasswordOtp(req, res) {
    try {
      const { email, otp } = req.body;

      if (!email || !otp) {
        return res.status(400).json({ success: false, error: 'Email and OTP are required' });
      }

      const otpRecord = await Otp.findOne({ email, purpose: 'forgot-password' });

      if (!otpRecord) {
        return res.status(400).json({ success: false, error: 'OTP expired or not found. Please request a new one.' });
      }

      if (otpRecord.otp !== otp) {
        return res.status(400).json({ success: false, error: 'Invalid OTP' });
      }

      res.status(200).json({
        success: true,
        message: 'OTP verified successfully'
      });
    } catch (error) {
      console.error('Verify forgot password OTP error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  },

  // Reset password (after OTP verification)
  async resetPassword(req, res) {
    try {
      const { email, otp, newPassword } = req.body;

      if (!email || !otp || !newPassword) {
        return res.status(400).json({ success: false, error: 'Email, OTP, and new password are required' });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
      }

      // Verify OTP again for security
      const otpRecord = await Otp.findOne({ email, purpose: 'forgot-password' });

      if (!otpRecord || otpRecord.otp !== otp) {
        return res.status(400).json({ success: false, error: 'Invalid or expired OTP' });
      }

      const user = await User.findOne({ email });
      if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      // Update password in Firebase
      if (user.firebaseUid) {
        try {
          await auth.updateUser(user.firebaseUid, { password: newPassword });
        } catch (err) {
          console.error('Firebase password update failed:', err);
          return res.status(500).json({ success: false, error: 'Failed to update password' });
        }
      }

      // Update hashed password in MongoDB
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(newPassword, salt);
      await user.save();

      // Clean up OTP
      await Otp.deleteMany({ email, purpose: 'forgot-password' });

      res.status(200).json({
        success: true,
        message: 'Password reset successfully'
      });
    } catch (error) {
      console.error('Reset password error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  },

  // Change password (for logged-in users)
  async changePassword(req, res) {
    try {
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ success: false, error: 'Current and new passwords are required' });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({ success: false, error: 'New password must be at least 8 characters' });
      }

      const user = await User.findById(req.user._id).select('+password');
      if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      // Verify current password
      if (user.password) {
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
          return res.status(400).json({ success: false, error: 'Current password is incorrect' });
        }
      }

      // Update in Firebase
      if (user.firebaseUid) {
        try {
          await auth.updateUser(user.firebaseUid, { password: newPassword });
        } catch (err) {
          console.error('Firebase password update failed:', err);
          return res.status(500).json({ success: false, error: 'Failed to update password' });
        }
      }

      // Update hashed password in MongoDB
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(newPassword, salt);
      await user.save();

      res.status(200).json({
        success: true,
        message: 'Password changed successfully'
      });
    } catch (error) {
      console.error('Change password error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
};

module.exports = authController;
