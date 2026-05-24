const Booking = require('../models/Booking');
const Expert = require('../models/Expert');
const Payment = require('../models/Payment');
const slotService = require('../services/slotService');
const razorpayService = require('../services/razorpayService');
const emailService = require('../services/emailService');
const { createNotification } = require('../services/notificationService');
const { asyncHandler, AppError } = require('../middleware/errorMiddleware');
const { buildPaginationQuery, generateMeetingLink, generateMeetingPassword } = require('../utils/helpers');
const { BOOKING_EXPIRY_MINUTES } = require('../utils/constants');

// Create a new booking
const createBooking = asyncHandler(async (req, res) => {
  const { expertId, slotId, notes } = req.body;
  
  // Get expert details
  const expert = await Expert.findById(expertId);
  if (!expert) {
    throw new AppError('Expert not found', 404);
  }
  
  if (!expert.isActive) {
    throw new AppError('Expert is not available', 400);
  }
  
  // Get slot details
  const slot = expert.availableSlots.id(slotId);
  if (!slot) {
    throw new AppError('Slot not found', 404);
  }
  
  // Lock the slot
  try {
    await slotService.lockSlot(expertId, slotId, req.user._id);
  } catch (error) {
    throw new AppError(error.message, 400);
  }
  
  const slotType = slot?.type === 'group' ? 'group' : 'individual';

  // Create booking
  const booking = await Booking.create({
    userId: req.user._id,
    expertId,
    slot: {
      slotId: slot._id,
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime
    },
    sessionType: slotType,
    amount: expert.pricePerSession,
    currency: expert.currency || 'INR',
    paymentMode: 'paid',
    status: 'pending',
    notes: {
      userNotes: notes || ''
    },
    expiresAt: new Date(Date.now() + BOOKING_EXPIRY_MINUTES * 60 * 1000)
  });
  
  // Create Razorpay order
  const order = await razorpayService.createOrder(
    expert.pricePerSession,
    'INR',
    `booking_${booking._id}`,
    {
      bookingId: booking._id.toString(),
      expertId: expertId.toString(),
      userId: req.user._id.toString()
    }
  );
  
  // Update booking with Razorpay order ID
  booking.razorpayOrderId = order.order.id;
  await booking.save();
  
  // Create payment record
  await Payment.create({
    userId: req.user._id,
    bookingId: booking._id,
    expertId,
    razorpayOrderId: order.order.id,
    amount: expert.pricePerSession,
    currency: 'INR',
    status: 'created'
  });
  
  res.status(201).json({
    success: true,
    data: {
      booking,
      order: order.order,
      key: razorpayService.getKeyId(),
      amount: expert.pricePerSession,
      currency: 'INR',
      expert: {
        name: expert.name,
        email: expert.email
      }
    }
  });
});

// Get user's bookings
const getMyBookings = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 10 } = req.query;
  
  const query = { userId: req.user._id };
  if (status) query.status = status;
  
  const { skip, limit: limitNum } = buildPaginationQuery(page, limit);
  
  const [bookings, total] = await Promise.all([
    Booking.find(query)
      .populate('expertId', 'name avatar title company pricePerSession')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    Booking.countDocuments(query)
  ]);
  
  res.status(200).json({
    success: true,
    data: bookings,
    pagination: {
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / limitNum),
      totalItems: total
    }
  });
});

// Get booking by ID
const getBookingById = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id)
    .populate('expertId', 'name avatar title company email')
    .populate('userId', 'name email avatar');
  
  if (!booking) {
    throw new AppError('Booking not found', 404);
  }
  
  // Check ownership
  const isOwner = booking.userId._id.toString() === req.user._id.toString();
  const isExpert = req.expert && booking.expertId._id.toString() === req.expert._id.toString();
  
  if (!isOwner && !isExpert) {
    throw new AppError('Not authorized to view this booking', 403);
  }
  
  res.status(200).json({
    success: true,
    data: booking
  });
});

// Cancel booking
const cancelBooking = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  
  const booking = await Booking.findById(req.params.id)
    .populate('expertId', 'name email')
    .populate('userId', 'name email');
  
  if (!booking) {
    throw new AppError('Booking not found', 404);
  }
  
  // Check ownership
  if (booking.userId._id.toString() !== req.user._id.toString()) {
    throw new AppError('Not authorized to cancel this booking', 403);
  }
  
  // Cancel booking
  await booking.cancelBooking('user', reason);
  
  // Release the slot
  await slotService.releaseSlot(booking.expertId._id, booking.slot.slotId, booking._id);
  
  // TODO: Process refund if already paid
  
  res.status(200).json({
    success: true,
    message: 'Booking cancelled successfully',
    data: booking
  });
});

// Reschedule booking
const rescheduleBooking = asyncHandler(async (req, res) => {
  const { newSlotId } = req.body;
  
  const booking = await Booking.findById(req.params.id);
  
  if (!booking) {
    throw new AppError('Booking not found', 404);
  }
  
  // Check ownership
  if (booking.userId.toString() !== req.user._id.toString()) {
    throw new AppError('Not authorized to reschedule this booking', 403);
  }
  
  // Get expert
  const expert = await Expert.findById(booking.expertId);
  if (!expert) {
    throw new AppError('Expert not found', 404);
  }
  
  // Get new slot
  const newSlot = expert.availableSlots.id(newSlotId);
  if (!newSlot) {
    throw new AppError('New slot not found', 404);
  }
  
  if (newSlot.status !== 'available') {
    throw new AppError('New slot is not available', 400);
  }
  
  // Release old slot
  await slotService.releaseSlot(booking.expertId, booking.slot.slotId, booking._id);
  
  // Lock and book new slot
  await slotService.lockSlot(booking.expertId, newSlotId, req.user._id);
  await slotService.confirmSlotBooking(booking.expertId, newSlotId, booking._id);
  
  // Update booking
  await booking.rescheduleBooking({
    slotId: newSlot._id,
    date: newSlot.date,
    startTime: newSlot.startTime,
    endTime: newSlot.endTime
  }, 'user');

  booking.sessionType = newSlot?.type === 'group' ? 'group' : 'individual';
  await booking.save();

  const formattedDate = newSlot?.date ? new Date(newSlot.date).toLocaleDateString('en-IN') : 'a new date';
  Promise.allSettled([
    createNotification({
      userId: booking.userId,
      type: 'booking_rescheduled',
      audience: 'student',
      title: 'Booking rescheduled',
      message: `Your session has been rescheduled to ${formattedDate} at ${newSlot.startTime}.`,
      data: {
        bookingId: booking._id,
        expertId: booking.expertId,
        scheduledAt: newSlot.date
      }
    }),
    createNotification({
      userId: expert.user,
      type: 'booking_rescheduled',
      audience: 'expert',
      title: 'A session was rescheduled',
      message: `A student rescheduled their session to ${formattedDate} at ${newSlot.startTime}.`,
      data: {
        bookingId: booking._id,
        scheduledAt: newSlot.date
      }
    })
  ]).catch(err => console.error('Reschedule notification error:', err));

  res.status(200).json({
    success: true,
    message: 'Booking rescheduled successfully',
    data: booking
  });
});

// Get upcoming bookings
const getUpcomingBookings = asyncHandler(async (req, res) => {
  const bookings = await Booking.find({
    userId: req.user._id,
    status: { $in: ['paid', 'accepted'] },
    'slot.date': { $gte: new Date() }
  })
    .populate('expertId', 'name avatar title company')
    .sort({ 'slot.date': 1 });
  
  res.status(200).json({
    success: true,
    data: bookings
  });
});

// Add feedback for completed booking
const addFeedback = asyncHandler(async (req, res) => {
  const { rating, review } = req.body;
  
  if (!rating || rating < 1 || rating > 5) {
    throw new AppError('Rating must be between 1 and 5', 400);
  }
  
  const booking = await Booking.findById(req.params.id);
  
  if (!booking) {
    throw new AppError('Booking not found', 404);
  }
  
  // Check ownership
  if (booking.userId.toString() !== req.user._id.toString()) {
    throw new AppError('Not authorized to add feedback', 403);
  }
  
  await booking.addFeedback(rating, review);
  
  // Update expert rating
  const expert = await Expert.findById(booking.expertId);
  const totalRating = expert.rating.average * expert.rating.count + rating;
  expert.rating.count += 1;
  expert.rating.average = totalRating / expert.rating.count;
  await expert.save();
  
  res.status(200).json({
    success: true,
    message: 'Feedback submitted successfully',
    data: booking
  });
});

// Cleanup expired bookings
const cleanupExpiredBookings = asyncHandler(async (req, res) => {
  const count = await Booking.cleanupExpiredBookings();
  await slotService.cleanupExpiredLocks();
  
  res.status(200).json({
    success: true,
    message: `Cleaned up ${count} expired bookings`
  });
});

module.exports = {
  createBooking,
  getMyBookings,
  getBookingById,
  cancelBooking,
  rescheduleBooking,
  getUpcomingBookings,
  addFeedback,
  cleanupExpiredBookings
};
