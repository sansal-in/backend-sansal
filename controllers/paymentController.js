const Booking = require('../models/Booking');
const Payment = require('../models/Payment');
const Expert = require('../models/Expert');
const User = require('../models/User');
const razorpayService = require('../services/razorpayService');
const slotService = require('../services/slotService');
const emailService = require('../services/emailService');
const { asyncHandler, AppError } = require('../middleware/errorMiddleware');

// Verify payment and confirm booking
const verifyPayment = asyncHandler(async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  const payment = await Payment.findOne({ razorpayOrderId: razorpay_order_id });
  if (!payment) {
    throw new AppError('Payment record not found', 404);
  }

  if (payment.userId.toString() !== req.user._id.toString()) {
    throw new AppError('Not authorized for this payment', 403);
  }

  const booking = await Booking.findById(payment.bookingId);
  if (!booking) {
    throw new AppError('Booking not found', 404);
  }

  // Idempotent success for already-processed payment
  if (payment.status === 'paid' && booking.status === 'paid') {
    return res.status(200).json({
      success: true,
      message: 'Payment already verified',
      data: {
        booking,
        payment
      }
    });
  }
  
  // Verify signature
  let isValid = razorpayService.verifyPaymentSignature(
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature
  );

  let paymentDetails = null;
  try {
    paymentDetails = await razorpayService.fetchPayment(razorpay_payment_id);
    const fetchedOrderId = paymentDetails?.payment?.orderId || paymentDetails?.payment?.order_id;
    if (!isValid && fetchedOrderId && fetchedOrderId === razorpay_order_id) {
      isValid = true;
    }
  } catch (error) {
    // Continue with signature-only verification when fetch fails.
    console.warn('Razorpay fetch during verify failed:', error?.message || error);
  }

  if (!isValid) {
    throw new AppError('Invalid payment signature', 400);
  }

  payment.razorpayPaymentId = razorpay_payment_id;
  payment.razorpaySignature = razorpay_signature;
  payment.status = 'paid';
  payment.paidAt = payment.paidAt || new Date();
  if (paymentDetails?.payment?.method) payment.method = paymentDetails.payment.method;
  if (paymentDetails?.payment?.bank) payment.bank = paymentDetails.payment.bank;
  if (paymentDetails?.payment?.wallet) payment.wallet = paymentDetails.payment.wallet;
  if (paymentDetails?.payment?.vpa) payment.vpa = paymentDetails.payment.vpa;
  if (paymentDetails?.payment?.email) payment.email = paymentDetails.payment.email;
  if (paymentDetails?.payment?.contact) payment.contact = paymentDetails.payment.contact;
  if (typeof paymentDetails?.payment?.fee === 'number') payment.fee = paymentDetails.payment.fee;
  if (typeof paymentDetails?.payment?.tax === 'number') payment.tax = paymentDetails.payment.tax;
  await payment.save();

  await booking.confirmPayment(payment._id, {
    razorpayOrderId: razorpay_order_id,
    razorpayPaymentId: razorpay_payment_id
  });

  try {
    await slotService.confirmSlotBooking(
      booking.expertId,
      booking.slot.slotId,
      booking._id
    );
  } catch (error) {
    console.warn('Slot confirmation warning after payment:', error?.message || error);
  }

  const user = await User.findById(req.user._id);
  if (user) {
    await user.updateBookingStats(booking.amount);
  }

  const expert = await Expert.findById(booking.expertId);

  // Fire-and-forget email + WhatsApp operations to avoid blocking successful payment verification.
  const { sendBookingWhatsApp } = require('../services/whatsappService');
  const slotDate = booking?.slot?.date ? new Date(booking.slot.date).toDateString() : 'TBD';
  const slotTime = booking?.slot?.startTime && booking?.slot?.endTime
    ? `${booking.slot.startTime} - ${booking.slot.endTime}` : 'TBD';
  Promise.allSettled([
    emailService.sendBookingConfirmation(booking, user, expert),
    emailService.sendExpertBookingNotification(booking, user, expert),
    emailService.sendPaymentSuccess(payment, user),
    user?.phone ? sendBookingWhatsApp(user.phone, user.displayName || 'Student', expert?.name || 'Expert', slotDate, slotTime) : Promise.resolve()
  ]).catch(() => null);
  
  res.status(200).json({
    success: true,
    message: 'Payment verified and booking confirmed',
    data: {
      booking,
      payment
    }
  });
});

// Handle Razorpay webhook
const handleWebhook = asyncHandler(async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const rawBody = Buffer.isBuffer(req.body)
    ? req.body.toString('utf8')
    : JSON.stringify(req.body || {});
  
  // Verify webhook signature
  const isValid = razorpayService.verifyWebhookSignature(rawBody, signature);
  
  if (!isValid) {
    console.error('Invalid webhook signature');
    return res.status(400).json({ success: false, message: 'Invalid signature' });
  }

  const parsedBody = Buffer.isBuffer(req.body) ? JSON.parse(rawBody) : req.body;
  
  const event = parsedBody.event;
  const payload = parsedBody.payload;
  
  //console.log('Webhook received:', event);
  
  switch (event) {
    case 'payment.captured':
      await handlePaymentCaptured(payload.payment.entity);
      break;
      
    case 'payment.failed':
      await handlePaymentFailed(payload.payment.entity);
      break;
      
    case 'refund.created':
      await handleRefundCreated(payload.refund.entity);
      break;
      
    case 'refund.processed':
      await handleRefundProcessed(payload.refund.entity);
      break;
      
    default:
      //console.log('Unhandled webhook event:', event);
  }
  
  // Store webhook event
  const payment = await Payment.findOne({ 
    razorpayOrderId: payload.payment?.entity?.order_id 
  });
  
  if (payment) {
    await payment.addWebhookEvent(event, payload);
  }
  
  res.status(200).json({ success: true, received: true });
});

// Handle payment.captured webhook
const handlePaymentCaptured = async (paymentEntity) => {
  const payment = await Payment.findOne({ 
    razorpayOrderId: paymentEntity.order_id 
  });
  
  if (!payment) {
    console.error('Payment not found for order:', paymentEntity.order_id);
    return;
  }
  
  // Payment already processed
  if (payment.status === 'paid') {
    return;
  }
  
  // Update payment
  payment.razorpayPaymentId = paymentEntity.id;
  payment.status = 'paid';
  payment.method = paymentEntity.method;
  payment.bank = paymentEntity.bank;
  payment.wallet = paymentEntity.wallet;
  payment.vpa = paymentEntity.vpa;
  payment.email = paymentEntity.email || payment.email;
  payment.contact = paymentEntity.contact || payment.contact;
  payment.fee = paymentEntity.fee ? paymentEntity.fee / 100 : 0;
  payment.tax = paymentEntity.tax ? paymentEntity.tax / 100 : 0;
  payment.paidAt = new Date();
  await payment.save();
  
  // Update booking
  const booking = await Booking.findById(payment.bookingId);
  if (booking && booking.status === 'pending') {
    booking.status = 'paid';
    if (!booking.paymentMode) {
      booking.paymentMode = 'paid';
    }
    booking.paymentId = payment._id;
    booking.razorpayOrderId = paymentEntity.order_id;
    booking.razorpayPaymentId = paymentEntity.id;
    booking.expiresAt = null;
    await booking.save();
    
    // Confirm slot
    await slotService.confirmSlotBooking(
      booking.expertId,
      booking.slot.slotId,
      booking._id
    );
  }
  
  //console.log('Payment captured via webhook:', paymentEntity.id);
};

// Handle payment.failed webhook
const handlePaymentFailed = async (paymentEntity) => {
  const payment = await Payment.findOne({ 
    razorpayOrderId: paymentEntity.order_id 
  });
  
  if (!payment) {
    return;
  }
  
  await payment.markFailed(
    paymentEntity.error_code,
    paymentEntity.error_description
  );
  
  // Cancel booking and release slot
  const booking = await Booking.findById(payment.bookingId);
  if (booking) {
    await slotService.releaseSlot(booking.expertId, booking.slot.slotId, booking._id);
    booking.status = 'cancelled';
    booking.cancellation = {
      cancelledBy: 'system',
      reason: 'Payment failed',
      cancelledAt: new Date()
    };
    await booking.save();
  }
  
  //console.log('Payment failed via webhook:', paymentEntity.id);
};

// Handle refund.created webhook
const handleRefundCreated = async (refundEntity) => {
  //console.log('Refund created:', refundEntity.id);
};

// Handle refund.processed webhook
const handleRefundProcessed = async (refundEntity) => {
  const payment = await Payment.findOne({
    razorpayPaymentId: refundEntity.payment_id
  });
  
  if (payment) {
    await payment.processRefund(
      refundEntity.id,
      refundEntity.amount / 100,
      refundEntity.notes?.reason || 'Refund processed'
    );
    
    // Update booking refund status
    const booking = await Booking.findById(payment.bookingId);
    if (booking && booking.cancellation) {
      booking.cancellation.refundStatus = 'processed';
      booking.cancellation.refundAmount = refundEntity.amount / 100;
      await booking.save();
    }
  }
  
  //console.log('Refund processed:', refundEntity.id);
};

// Get payment details
const getPaymentDetails = asyncHandler(async (req, res) => {
  const payment = await Payment.findById(req.params.id)
    .populate('bookingId', 'slot status')
    .populate('expertId', 'name');
  
  if (!payment) {
    throw new AppError('Payment not found', 404);
  }
  
  // Check ownership
  if (payment.userId.toString() !== req.user._id.toString()) {
    throw new AppError('Not authorized to view this payment', 403);
  }
  
  res.status(200).json({
    success: true,
    data: payment
  });
});

// Get user's payment history
const getPaymentHistory = asyncHandler(async (req, res) => {
  const payments = await Payment.getUserPayments(req.user._id);
  
  res.status(200).json({
    success: true,
    data: payments
  });
});

// Request refund
const requestRefund = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  
  const payment = await Payment.findById(req.params.id);
  
  if (!payment) {
    throw new AppError('Payment not found', 404);
  }
  
  if (payment.userId.toString() !== req.user._id.toString()) {
    throw new AppError('Not authorized', 403);
  }
  
  if (payment.status !== 'paid') {
    throw new AppError('Refund can only be requested for paid payments', 400);
  }
  
  // Create refund via Razorpay
  const refund = await razorpayService.createRefund(
    payment.razorpayPaymentId,
    payment.amount,
    { reason }
  );
  
  // Update payment
  payment.status = 'refunded';
  payment.refund = {
    refundId: refund.refund.id,
    amount: payment.amount,
    status: 'pending',
    reason
  };
  await payment.save();
  
  res.status(200).json({
    success: true,
    message: 'Refund initiated successfully',
    data: payment
  });
});

// Get Razorpay key
const getRazorpayKey = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    key: razorpayService.getKeyId()
  });
});

module.exports = {
  verifyPayment,
  handleWebhook,
  getPaymentDetails,
  getPaymentHistory,
  requestRefund,
  getRazorpayKey
};
