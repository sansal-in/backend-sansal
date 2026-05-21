const express = require('express');
const router = express.Router();
const {
  createBooking,
  getMyBookings,
  getBookingById,
  cancelBooking,
  rescheduleBooking,
  getUpcomingBookings,
  addFeedback,
  cleanupExpiredBookings
} = require('../controllers/bookingController');
const { verifyFirebaseToken } = require('../middleware/auth');
const { validateBooking, validateObjectId, sanitizeInput } = require('../middleware/validate');

// Apply sanitization
router.use(sanitizeInput);

// All booking routes require authentication
router.use(verifyFirebaseToken);

// Booking routes
router.post('/', validateBooking, createBooking);
router.get('/my-bookings', getMyBookings);
router.get('/upcoming', getUpcomingBookings);
router.get('/:id', validateObjectId('id'), getBookingById);
router.put('/:id/cancel', validateObjectId('id'), cancelBooking);
router.put('/:id/reschedule', validateObjectId('id'), rescheduleBooking);
router.post('/:id/feedback', validateObjectId('id'), addFeedback);

// Internal/Admin route for cleanup
router.post('/cleanup', cleanupExpiredBookings);

module.exports = router;