module.exports = {
  // Booking statuses
  BOOKING_STATUS: {
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
    PAID: 'paid',
    ACCEPTED: 'accepted',
    REJECTED: 'rejected',
    CANCELLED: 'cancelled',
    COMPLETED: 'completed',
    NO_SHOW: 'no-show'
  },

  
  // Slot statuses
  SLOT_STATUS: {
    AVAILABLE: 'available',
    LOCKED: 'locked',
    BOOKED: 'booked'
  },

  // Payment statuses
  PAYMENT_STATUS: {
    CREATED: 'created',
    ATTEMPTED: 'attempted',
    PAID: 'paid',
    FAILED: 'failed',
    REFUNDED: 'refunded'
  },

  // Time constants
  SLOT_LOCK_DURATION_MINUTES: 5,
  BOOKING_EXPIRY_MINUTES: 10,
  SESSION_DURATION_DEFAULT: 60,

  // Currency
  DEFAULT_CURRENCY: 'INR',

  // Pagination
  DEFAULT_PAGE_SIZE: 10,
  MAX_PAGE_SIZE: 50,

  // Razorpay
  RAZORPAY_CURRENCY: 'INR',

  // User roles
  USER_ROLES: {
    USER: 'user',
    EXPERT: 'expert',
    ADMIN: 'admin'
  },

  // Email templates
  EMAIL_TEMPLATES: {
    BOOKING_CONFIRMATION: 'booking_confirmation',
    PAYMENT_SUCCESS: 'payment_success',
    BOOKING_ACCEPTED: 'booking_accepted',
    BOOKING_REJECTED: 'booking_rejected',
    BOOKING_CANCELLED: 'booking_cancelled',
    REMINDER_24H: 'reminder_24h',
    REMINDER_1H: 'reminder_1h'
  }
};