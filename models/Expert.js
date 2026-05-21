const mongoose = require('mongoose');

// Slot schema for available time slots
const slotSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true
  },
  startTime: {
    type: String,
    required: true // Format: "HH:mm"
  },
  endTime: {
    type: String,
    required: true // Format: "HH:mm"
  },
  type: {
    type: String,
    enum: ['individual', 'group'],
    default: 'individual'
  },
  capacity: {
    type: Number,
    min: 1,
    default: 1
  },
  bookedCount: {
    type: Number,
    min: 0,
    default: 0
  },
  bookingIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking'
  }],
  status: {
    type: String,
    enum: ['available', 'locked', 'booked'],
    default: 'available'
  },
  lockedAt: {
    type: Date,
    default: null
  },
  lockedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  lockedSeats: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    lockedAt: {
      type: Date,
      default: Date.now
    }
  }],
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    default: null
  }
}, { _id: true });

const expertSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  firebaseUid: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  avatar: {
    type: String,
    default: ''
  },
  bio: {
    type: String,
    maxlength: 1000,
    default: ''
  },
  title: {
    type: String,
    default: 'Interview Expert'
  },
  company: {
    type: String,
    default: ''
  },
  experience: {
    type: Number, // Years of experience
    default: 0
  },
  skills: [{
    type: String,
    trim: true
  }],
  specialization: [{
    type: String,
    trim: true
  }],
  languages: [{
    type: String,
    default: ['English']
  }],
  pricePerSession: {
    type: Number,
    required: true,
    min: 0
  },
  sessionDuration: {
    type: Number, // Duration in minutes
    default: 60
  },
  currency: {
    type: String,
    default: 'INR'
  },
  rating: {
    average: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    count: {
      type: Number,
      default: 0
    }
  },
  hourlyRate: {
    type: Number,
    default: 0
  },
  availableSlots: [slotSchema],
  totalEarnings: {
    type: Number,
    default: 0
  },
  totalSessions: {
    type: Number,
    default: 0
  },
  completedSessions: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  socialLinks: {
    linkedin: String,
    twitter: String,
    website: String
  },
  timezone: {
    type: String,
    default: 'Asia/Kolkata'
  }
}, {
  timestamps: true
});

// Indexes
expertSchema.index({ skills: 1 });
expertSchema.index({ pricePerSession: 1 });
expertSchema.index({ 'rating.average': -1 });
expertSchema.index({ isActive: 1, isVerified: 1 });

// Virtual for bookings
expertSchema.virtual('bookings', {
  ref: 'Booking',
  localField: '_id',
  foreignField: 'expertId'
});

// Method to add a new slot
expertSchema.methods.addSlot = async function(slotData) {
  // Check for duplicate slot
  const duplicate = this.availableSlots.find(
    slot => 
      slot.date.toDateString() === new Date(slotData.date).toDateString() &&
      slot.startTime === slotData.startTime
  );
  
  if (duplicate) {
    throw new Error('Slot already exists for this time');
  }

  const normalizedType = slotData.type === 'group' ? 'group' : 'individual';
  let capacity = Number(slotData.capacity);
  if (!Number.isFinite(capacity) || capacity <= 0) {
    capacity = normalizedType === 'group' ? 10 : 1;
  }
  if (normalizedType === 'individual') {
    capacity = 1;
  } else {
    capacity = Math.max(2, Math.min(10, capacity));
  }
  
  this.availableSlots.push({
    date: new Date(slotData.date),
    startTime: slotData.startTime,
    endTime: slotData.endTime,
    status: 'available',
    type: normalizedType,
    capacity,
    bookedCount: 0
  });
  
  await this.save();
  return this.availableSlots[this.availableSlots.length - 1];
};

// Method to lock a slot
expertSchema.methods.lockSlot = async function(slotId, userId) {
  const slot = this.availableSlots.id(slotId);
  
  if (!slot) {
    throw new Error('Slot not found');
  }
  
  if (slot.status !== 'available') {
    throw new Error('Slot is not available');
  }
  
  slot.status = 'locked';
  slot.lockedAt = new Date();
  slot.lockedBy = userId;
  
  await this.save();
  return slot;
};

// Method to unlock a slot
expertSchema.methods.unlockSlot = async function(slotId) {
  const slot = this.availableSlots.id(slotId);
  
  if (!slot) {
    throw new Error('Slot not found');
  }
  
  slot.status = 'available';
  slot.lockedAt = null;
  slot.lockedBy = null;
  
  await this.save();
  return slot;
};

// for get detailed stats for booking
expertSchema.methods.getDetailedStats = async function() {
  const expertId = this._id;
  
  const bookings = await mongoose.model('Booking').find({ expertId });
  
  const now = new Date();
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  
  const thisMonthBookings = bookings.filter(b => 
    new Date(b.createdAt) >= thisMonth
  );
  
  const lastMonthBookings = bookings.filter(b => 
    new Date(b.createdAt) >= lastMonth && new Date(b.createdAt) < thisMonth
  );

  return {
    total: bookings.length,
    thisMonth: thisMonthBookings.length,
    lastMonth: lastMonthBookings.length,
    completed: bookings.filter(b => b.status === 'completed').length,
    completionRate: bookings.length > 0 
      ? (bookings.filter(b => b.status === 'completed').length / bookings.length) * 100 
      : 0,
    totalEarnings: bookings
      .filter(b => b.status === 'completed')
      .reduce((sum, b) => sum + (b.amount || 0), 0),
    thisMonthEarnings: thisMonthBookings
      .filter(b => b.status === 'completed')
      .reduce((sum, b) => sum + (b.amount || 0), 0),
    averageRating: this.rating?.average || 0,
    uniqueStudents: [...new Set(bookings.map(b => b.userId.toString()))].length
  };
};

// Method to confirm booking for a slot
expertSchema.methods.confirmSlotBooking = async function(slotId, bookingId) {
  const slot = this.availableSlots.id(slotId);
  
  if (!slot) {
    throw new Error('Slot not found');
  }
  
  slot.status = 'booked';
  slot.bookingId = bookingId;
  
  await this.save();
  return slot;
};

// Method to update earnings
expertSchema.methods.updateEarnings = async function(amount) {
  this.totalEarnings += amount;
  this.totalSessions += 1;
  await this.save();
};

// Static method to get available experts
expertSchema.statics.getAvailableExperts = async function(filters = {}) {
  const query = {
    isActive: true,
    isVerified: true
  };
  
  if (filters.skills && filters.skills.length > 0) {
    query.skills = { $in: filters.skills };
  }
  
  if (filters.minPrice) {
    query.pricePerSession = { $gte: filters.minPrice };
  }
  
  if (filters.maxPrice) {
    query.pricePerSession = { ...query.pricePerSession, $lte: filters.maxPrice };
  }
  
  return this.find(query)
    .select('-availableSlots')
    .sort({ 'rating.average': -1 });
};

// Pre-save hook to clean up expired locks
expertSchema.pre('save', function() {
  const now = new Date();
  const LOCK_EXPIRY_MINUTES = 5;
  
  this.availableSlots.forEach(slot => {
    if (slot.status === 'locked' && slot.lockedAt) {
      const lockAge = (now - slot.lockedAt) / 1000 / 60; // in minutes
      if (lockAge > LOCK_EXPIRY_MINUTES) {
        slot.status = 'available';
        slot.lockedAt = null;
        slot.lockedBy = null;
      }
    }
    if (Array.isArray(slot.lockedSeats) && slot.lockedSeats.length > 0) {
      slot.lockedSeats = slot.lockedSeats.filter(lock => {
        if (!lock.lockedAt) return false;
        const lockAge = (now - new Date(lock.lockedAt)) / 1000 / 60;
        return lockAge <= LOCK_EXPIRY_MINUTES;
      });
    }
  });
});

module.exports = mongoose.model('Expert', expertSchema);
