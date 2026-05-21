const crypto = require('crypto');
const { razorpay } = require('../config/razorpay');
const { toPaise, toRupees } = require('../utils/helpers');

class RazorpayService {
  // Create a new Razorpay order
  async createOrder(amount, currency = 'INR', receipt, notes = {}) {
    try {
      const options = {
        amount: toPaise(amount), // Razorpay expects amount in paise
        currency,
        receipt,
        notes
      };
      
      const order = await razorpay.orders.create(options);
      
      return {
        success: true,
        order: {
          id: order.id,
          amount: toRupees(order.amount),
          currency: order.currency,
          receipt: order.receipt,
          status: order.status
        }
      };
    } catch (error) {
      console.error('Razorpay create order error:', error);
      throw new Error(error.error?.description || 'Failed to create payment order');
    }
  }
  
  // Verify payment signature
  verifyPaymentSignature(orderId, paymentId, signature) {
    try {
      const body = orderId + '|' + paymentId;
      const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(body.toString())
        .digest('hex');
      
      return expectedSignature === signature;
    } catch (error) {
      console.error('Signature verification error:', error);
      return false;
    }
  }
  
  // Fetch payment details
  async fetchPayment(paymentId) {
    try {
      const payment = await razorpay.payments.fetch(paymentId);
      return {
        success: true,
        payment: {
          id: payment.id,
          orderId: payment.order_id,
          amount: toRupees(payment.amount),
          currency: payment.currency,
          status: payment.status,
          method: payment.method,
          email: payment.email,
          contact: payment.contact,
          bank: payment.bank,
          wallet: payment.wallet,
          vpa: payment.vpa,
          fee: payment.fee ? toRupees(payment.fee) : 0,
          tax: payment.tax ? toRupees(payment.tax) : 0
        }
      };
    } catch (error) {
      console.error('Fetch payment error:', error);
      throw new Error('Failed to fetch payment details');
    }
  }
  
  // Fetch order details
  async fetchOrder(orderId) {
    try {
      const order = await razorpay.orders.fetch(orderId);
      return {
        success: true,
        order: {
          id: order.id,
          amount: toRupees(order.amount),
          amountPaid: toRupees(order.amount_paid),
          amountDue: toRupees(order.amount_due),
          currency: order.currency,
          receipt: order.receipt,
          status: order.status,
          attempts: order.attempts
        }
      };
    } catch (error) {
      console.error('Fetch order error:', error);
      throw new Error('Failed to fetch order details');
    }
  }
  
  // Create refund
  async createRefund(paymentId, amount, notes = {}) {
    try {
      const refund = await razorpay.payments.refund(paymentId, {
        amount: toPaise(amount),
        notes
      });
      
      return {
        success: true,
        refund: {
          id: refund.id,
          paymentId: refund.payment_id,
          amount: toRupees(refund.amount),
          status: refund.status
        }
      };
    } catch (error) {
      console.error('Create refund error:', error);
      throw new Error(error.error?.description || 'Failed to create refund');
    }
  }
  
  // Verify webhook signature
  verifyWebhookSignature(body, signature) {
    try {
      const payload = Buffer.isBuffer(body)
        ? body.toString('utf8')
        : typeof body === 'string'
          ? body
          : JSON.stringify(body);
      const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
        .update(payload)
        .digest('hex');
      
      return expectedSignature === signature;
    } catch (error) {
      console.error('Webhook signature verification error:', error);
      return false;
    }
  }
  
  // Get Razorpay key for frontend
  getKeyId() {
    return process.env.RAZORPAY_KEY_ID;
  }
}

module.exports = new RazorpayService();