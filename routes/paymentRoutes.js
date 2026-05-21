const express = require('express');
const router = express.Router();
const {
  verifyPayment,
  handleWebhook,
  getPaymentDetails,
  getPaymentHistory,
  requestRefund,
  getRazorpayKey
} = require('../controllers/paymentController');
const { verifyFirebaseToken } = require('../middleware/auth');
const { validatePaymentVerification, validateObjectId, sanitizeInput } = require('../middleware/validate');

// Public routes
router.get('/key', getRazorpayKey);

// Webhook (raw body is configured in server.js)
router.post('/webhook', handleWebhook);

// Apply sanitization for other routes
router.use(sanitizeInput);

// Protected routes
router.post('/verify', verifyFirebaseToken, validatePaymentVerification, verifyPayment);
router.get('/history', verifyFirebaseToken, getPaymentHistory);
router.get('/:id', verifyFirebaseToken, validateObjectId('id'), getPaymentDetails);
router.post('/:id/refund', verifyFirebaseToken, validateObjectId('id'), requestRefund);

module.exports = router;