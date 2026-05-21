const mongoose = require('mongoose');

const normalizeStageStatus = (value) => String(value || '').toLowerCase();

const normalizePaymentMode = (value, amount) => {
  if (value === 'free' || value === 'paid') return value;
  const numericAmount = Number(amount);
  if (Number.isFinite(numericAmount) && numericAmount <= 0) return 'free';
  return 'paid';
};

const buildBookingStages = (booking) => {
  const status = normalizeStageStatus(booking?.status);
  const paymentMode = normalizePaymentMode(booking?.paymentMode, booking?.amount);
  const isPaid = Boolean(booking?.paymentId) || ['paid', 'accepted', 'confirmed', 'completed'].includes(status);
  const isCancelled = status === 'cancelled';
  const isRejected = status === 'rejected';
  const isAccepted = ['accepted', 'confirmed', 'completed'].includes(status);
  const isAwaitingDecision = ['paid', 'confirmed'].includes(status);
  const isPaymentPending = status === 'pending' && paymentMode !== 'free';

  const paymentValue = paymentMode === 'free' ? 'free' : (isPaid ? 'paid' : 'pending');
  const bookingValue = isPaymentPending ? 'pending' : 'booked';
  const expertValue = isRejected ? 'rejected' : (isAccepted ? 'accepted' : 'pending');
  const confirmationValue = isAccepted ? 'confirmed' : 'pending';
  const completionValue = status === 'completed' ? 'completed' : 'pending';
  const cancellationValue = isCancelled ? 'cancelled' : 'available';

  const paymentState = isPaymentPending ? 'current' : 'done';
  const bookingState = isPaymentPending ? 'pending' : 'done';
  const expertState = isRejected
    ? 'rejected'
    : isAccepted
      ? 'done'
      : isAwaitingDecision
        ? 'current'
        : 'pending';
  const confirmationState = isAccepted
    ? status === 'completed'
      ? 'done'
      : 'current'
    : isRejected || isCancelled
      ? 'blocked'
      : 'pending';
  const completionState = status === 'completed'
    ? 'done'
    : isRejected || isCancelled
      ? 'blocked'
      : 'pending';
  const cancellationState = isCancelled
    ? 'cancelled'
    : isRejected || status === 'completed'
      ? 'blocked'
      : 'pending';

  const rejectionReason = isRejected ? (booking?.cancellation?.reason || '') : '';
  const cancellationReason = isCancelled ? (booking?.cancellation?.reason || '') : '';

  return {
    paymentMode,
    list: [
      { order: 1, key: 'payment', label: 'Payment', state: paymentState, value: paymentValue },
      { order: 2, key: 'booking', label: 'Booking', state: bookingState, value: bookingValue },
      { order: 3, key: 'expert', label: 'Expert Decision', state: expertState, value: expertValue, reason: rejectionReason || undefined },
      { order: 4, key: 'confirmation', label: 'Confirmation', state: confirmationState, value: confirmationValue },
      { order: 5, key: 'completion', label: 'Completion', state: completionState, value: completionValue },
      { order: 6, key: 'cancellation', label: 'Cancellation', state: cancellationState, value: cancellationValue, reason: cancellationReason || undefined }
    ]
  };
};

const bookingSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  expertId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Expert',
    required: true,
    index: true
  },
  slot: {
    slotId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    date: {
      type: Date,
      required: true
    },
    startTime: {
      type: String,
      required: true
    },
    endTime: {
      type: String,
      required: true
    }
  },
  sessionType: {
    type: String,
    enum: ['individual', 'group'],
    default: 'individual'
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'INR'
  },
  paymentMode: {
    type: String,
    enum: ['paid', 'free'],
    default: 'paid'
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'paid', 'accepted', 'rejected', 'cancelled', 'completed', 'no-show'],
    default: 'pending'
  },
  paymentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment',
    default: null
  },
  razorpayOrderId: {
    type: String,
    default: null
  },
  razorpayPaymentId: {
    type: String,
    default: null
  },
  meetingLink: {
    type: String,
    default: ''
  },
  meetingPassword: {
    type: String,
    default: ''
  },
  meetingProvider: {
    type: String,
    default: ''
  },
  meetingId: {
    type: String,
    default: ''
  },
  meetingCode: {
    type: String,
    default: ''
  },
  meetingReport: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  notes: {
    userNotes: {
      type: String,
      maxlength: 500,
      default: ''
    },
    expertNotes: {
      type: String,
      maxlength: 500,
      default: ''
    }
  },
  feedback: {
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    review: {
      type: String,
      maxlength: 1000
    },
    submittedAt: Date
  },
  cancellation: {
    cancelledBy: {
      type: String,
      enum: ['user', 'expert', 'system']
    },
    reason: String,
    cancelledAt: Date,
    refundStatus: {
      type: String,
      enum: ['pending', 'processed', 'failed', 'not-applicable'],
      default: 'not-applicable'
    },
    refundAmount: Number
  },
  reschedule: {
    isRescheduled: {
      type: Boolean,
      default: false
    },
    originalSlot: {
      date: Date,
      startTime: String,
      endTime: String
    },
    rescheduledBy: {
      type: String,
      enum: ['user', 'expert']
    },
    rescheduledAt: Date,
    rescheduleCount: {
      type: Number,
      default: 0
    }
  },
  reminders: {
    email24h: {
      type: Boolean,
      default: false
    },
    email1h: {
      type: Boolean,
      default: false
    }
  },
  expiresAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
bookingSchema.index({ status: 1 });
bookingSchema.index({ 'slot.date': 1 });
bookingSchema.index({ razorpayOrderId: 1 });
bookingSchema.index({ createdAt: -1 });
bookingSchema.index({ userId: 1, status: 1 });
bookingSchema.index({ expertId: 1, status: 1 });

// Virtual for scheduled datetime (derived from slot date + startTime)
bookingSchema.virtual('scheduledAt').get(function() {
  if (!this.slot?.date || !this.slot?.startTime) return null;
  const scheduledAt = new Date(this.slot.date);
  const [hours, minutes] = this.slot.startTime.split(':').map(Number);
  if (!Number.isNaN(hours)) {
    scheduledAt.setHours(hours, Number.isNaN(minutes) ? 0 : minutes, 0, 0);
  }
  return scheduledAt;
});

// Virtual for booking stages (payment/booking/decision/confirmation/completion/cancellation)
bookingSchema.virtual('stages').get(function() {
  return buildBookingStages(this);
});

// Virtual for payment details
bookingSchema.virtual('payment', {
  ref: 'Payment',
  localField: 'paymentId',
  foreignField: '_id',
  justOne: true
});

// Method to confirm payment
bookingSchema.methods.confirmPayment = async function(paymentId, paymentMeta = {}) {
  this.status = 'paid';
  this.paymentId = paymentId;
  if (!this.paymentMode) {
    this.paymentMode = 'paid';
  }
  if (paymentMeta?.razorpayOrderId) {
    this.razorpayOrderId = paymentMeta.razorpayOrderId;
  }
  if (paymentMeta?.razorpayPaymentId) {
    this.razorpayPaymentId = paymentMeta.razorpayPaymentId;
  }
  this.expiresAt = null; // Remove expiry after payment
  await this.save();
  return this;
};

// Method to accept booking (expert)
bookingSchema.methods.acceptBooking = async function(meetingLink, meetingPassword = '') {
  const isFreeBooking = this.paymentMode === 'free' || Number(this.amount) <= 0;
  const canAcceptPaid = this.status === 'paid';
  const canAcceptFree = isFreeBooking && ['pending', 'confirmed'].includes(this.status);
  if (!canAcceptPaid && !canAcceptFree) {
    throw new Error('Only paid/free bookings can be accepted');
  }
  
  this.status = 'accepted';
  this.meetingLink = meetingLink;
  this.meetingPassword = meetingPassword;
  await this.save();
  return this;
};

// Method to reject booking (expert)
bookingSchema.methods.rejectBooking = async function(reason) {
  const trimmedReason = String(reason || '').trim();
  if (!trimmedReason) {
    throw new Error('Rejection reason is required');
  }

  if (!['pending', 'paid', 'confirmed'].includes(this.status)) {
    throw new Error('Booking cannot be rejected');
  }
  
  this.status = 'rejected';
  this.cancellation = {
    cancelledBy: 'expert',
    reason: trimmedReason,
    cancelledAt: new Date(),
    refundStatus: this.paymentId ? 'pending' : 'not-applicable'
  };
  await this.save();
  return this;
};

// Method to cancel booking
bookingSchema.methods.cancelBooking = async function(cancelledBy, reason) {
  if (['completed', 'cancelled', 'rejected'].includes(this.status)) {
    throw new Error('Booking cannot be cancelled');
  }
  
  const previousStatus = this.status;
  this.status = 'cancelled';
  this.cancellation = {
    cancelledBy,
    reason,
    cancelledAt: new Date(),
    refundStatus: previousStatus === 'paid' ? 'pending' : 'not-applicable'
  };
  await this.save();
  return this;
};

// Method to reschedule booking
bookingSchema.methods.rescheduleBooking = async function(newSlot, rescheduledBy) {
  if (!['paid', 'accepted'].includes(this.status)) {
    throw new Error('Only paid or accepted bookings can be rescheduled');
  }
  
  if (this.reschedule.rescheduleCount >= 2) {
    throw new Error('Maximum reschedule limit reached');
  }
  
  this.reschedule = {
    isRescheduled: true,
    originalSlot: {
      date: this.slot.date,
      startTime: this.slot.startTime,
      endTime: this.slot.endTime
    },
    rescheduledBy,
    rescheduledAt: new Date(),
    rescheduleCount: this.reschedule.rescheduleCount + 1
  };
  
  this.slot = newSlot;
  await this.save();
  return this;
};

// Method to complete session
bookingSchema.methods.completeSession = async function() {
  if (this.status === 'completed') {
    return this;
  }
  // Allow completing from accepted, confirmed, paid, or in-progress (after meeting started)
  if (!['accepted', 'confirmed', 'paid', 'in-progress'].includes(this.status)) {
    throw new Error('Only accepted/in-progress bookings can be marked as completed');
  }
  
  this.status = 'completed';
  await this.save();
  return this;
};

// Method to add feedback
bookingSchema.methods.addFeedback = async function(rating, review) {
  if (this.status !== 'completed') {
    throw new Error('Feedback can only be added for completed sessions');
  }
  
  this.feedback = {
    rating,
    review,
    submittedAt: new Date()
  };
  await this.save();
  return this;
};

// Static method to get user bookings
bookingSchema.statics.getUserBookings = async function(userId, status = null) {
  const query = { userId };
  if (status) {
    query.status = status;
  }
  
  return this.find(query)
    .populate('expertId', 'name avatar title company pricePerSession')
    .sort({ 'slot.date': -1 });
};

// Static method to get expert bookings
bookingSchema.statics.getExpertBookings = async function(expertId, status = null) {
  const query = { expertId };
  if (status) {
    query.status = status;
  }
  
  return this.find(query)
    .populate('userId', 'name email avatar')
    .sort({ 'slot.date': -1 });
};

// Static method to cleanup expired pending bookings
bookingSchema.statics.cleanupExpiredBookings = async function() {
  const now = new Date();
  const expiredBookings = await this.find({
    status: 'pending',
    expiresAt: { $lt: now }
  });
  
  for (const booking of expiredBookings) {
    booking.status = 'cancelled';
    booking.cancellation = {
      cancelledBy: 'system',
      reason: 'Payment timeout',
      cancelledAt: now,
      refundStatus: 'not-applicable'
    };
    await booking.save();
  }
  
  return expiredBookings.length;
};

module.exports = mongoose.model('Booking', bookingSchema);
