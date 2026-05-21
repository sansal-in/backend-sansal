const { auth, db } = require('../config/firebaseAdmin');
const User = require('../models/User');

class FirebaseService {
  // Verify Firebase ID token
  static async verifyToken(token) {
    try {
      const decodedToken = await auth.verifyIdToken(token);
      return {
        success: true,
        uid: decodedToken.uid,
        email: decodedToken.email,
        name: decodedToken.name || '',
        picture: decodedToken.picture || ''
      };
    } catch (error) {
      console.error('Token verification error:', error);
      return { success: false, error: error.message };
    }
  }

  // Get user by Firebase UID
  static async getUserByFirebaseUid(uid) {
    try {
      const user = await User.findOne({ firebaseUid: uid });
      return user;
    } catch (error) {
      console.error('Error getting user:', error);
      return null;
    }
  }

  // Create or update user from Firebase
  static async syncUserFromFirebase(firebaseUser) {
    try {
      let user = await User.findOne({ firebaseUid: firebaseUser.uid });
      let isNewUser = false;

      if (!user) {
        isNewUser = true;
        // Create new user
        user = new User({
          firebaseUid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName || firebaseUser.name || '',
          photoURL: firebaseUser.photoURL || firebaseUser.picture || '',
          provider: firebaseUser.providerData?.[0]?.providerId || 'email',
          emailVerified: firebaseUser.emailVerified || false,
          accountCreated: new Date(firebaseUser.metadata?.creationTime || Date.now()),
          lastLogin: new Date()
        });
      } else {
        // Update existing user
        user.lastLogin = new Date();
        user.emailVerified = firebaseUser.emailVerified || user.emailVerified;
        if (firebaseUser.displayName && !user.displayName) {
          user.displayName = firebaseUser.displayName;
        }
        if (firebaseUser.photoURL && !user.photoURL) {
          user.photoURL = firebaseUser.photoURL;
        }
      }

      await user.save();
      return { success: true, user, isNewUser };
    } catch (error) {
      console.error('Error syncing user:', error);
      return { success: false, error: error.message };
    }
  }

  // Get user's Firestore data (for backward compatibility)
  static async getUserFirestoreData(uid) {
    try {
      const userDoc = await db.collection('users').doc(uid).get();
      if (userDoc.exists) {
        return { success: true, data: userDoc.data() };
      }
      return { success: false, error: 'User not found in Firestore' };
    } catch (error) {
      console.error('Error getting Firestore data:', error);
      return { success: false, error: error.message };
    }
  }

  // Send verification email
  static async sendVerificationEmail(uid) {
    try {
      const link = await auth.generateEmailVerificationLink(uid);
      // Here you would send the email using your email service
      // For now, we'll just return the link
      return { 
        success: true, 
        link,
        message: 'Verification email sent successfully'
      };
    } catch (error) {
      console.error('Error sending verification email:', error);
      return { success: false, error: error.message };
    }
  }

  // Update user profile in Firebase
  static async updateFirebaseProfile(uid, updates) {
    try {
      await auth.updateUser(uid, updates);
      return { success: true };
    } catch (error) {
      console.error('Error updating Firebase profile:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = FirebaseService;