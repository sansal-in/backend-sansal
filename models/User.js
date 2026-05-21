const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  firebaseUid: {
    type: String,
    required: true,
    unique: true,
    index: true // Keep only this one
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true // Keep only this one
  },
  displayName: {
    type: String,
    default: ''
  },
  phone: {
    type: String,
    default: ''
  },
  password: {
    type: String,
    select: false // Hide password by default in queries
  },
  photoURL: {
    type: String,
    default: ''
  },
  title: {
    type: String,
    default: '',
    trim: true,
    maxlength: 120
  },
  bio: {
    type: String,
    default: '',
    trim: true,
    maxlength: 500
  },
  location: {
    type: String,
    default: '',
    trim: true,
    maxlength: 120
  },
  linkedin: {
    type: String,
    default: '',
    trim: true
  },
  github: {
    type: String,
    default: '',
    trim: true
  },
  leetcode: {
    type: String,
    default: '',
    trim: true
  },
  portfolio: {
    type: String,
    default: '',
    trim: true
  },
  college: {
    type: String,
    default: '',
    trim: true,
    maxlength: 200,
    index: true
  },
  provider: {
    type: String,
    default: 'email'
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  role: {
    type: [String],
    enum: ['student', 'admin', 'expert'],
    default: ['student']
  },
  interviewsCompleted: {
    type: Number,
    default: 0
  },
  totalScore: {
    type: Number,
    default: 0
  },
  averageScore: {
    type: Number,
    default: 0
  },
  lastLogin: {
    type: Date,
    default: Date.now
  },
  accountCreated: {
    type: Date,
    default: Date.now
  },
  lastVerificationReminder: {
    type: Date,
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  },
  subscription: {
    type: String,
    enum: ['free', 'basic', 'premium'],
    default: 'free'
  },
  settings: {
    emailNotifications: {
      type: Boolean,
      default: true
    },
    theme: {
      type: String,
      default: 'light'
    },
    language: {
      type: String,
      default: 'en'
    }
  },
  totalBookings: {
    type: Number,
    default: 0
  },
  totalSpent: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

userSchema.index({ createdAt: -1 });

// Virtual for booking history
userSchema.virtual('bookings', {
  ref: 'Booking',
  localField: '_id',
  foreignField: 'userId'
});

// Method to update stats after booking
userSchema.methods.updateBookingStats = async function(amount) {
  this.totalBookings += 1;
  this.totalSpent += amount;
  await this.save();
};

// Method to update last login
userSchema.methods.updateLastLogin = function() {
  this.lastLogin = new Date();
  return this.save();
};

// Method to increment interview count
userSchema.methods.incrementInterviewCount = function(score) {
  this.interviewsCompleted += 1;
  this.totalScore += score;
  this.averageScore = this.totalScore / this.interviewsCompleted;
  return this.save();
};

const User = mongoose.model('User', userSchema);

module.exports = User;
