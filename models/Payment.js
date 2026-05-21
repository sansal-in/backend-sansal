const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      index: true,
    },
    expertId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Expert",
      required: true,
    },
    razorpayOrderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    razorpayPaymentId: {
      type: String,
      default: null,
      index: true,
    },
    razorpaySignature: {
      type: String,
      default: null,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: "INR",
    },
    status: {
      type: String,
      enum: [
        "created",
        "attempted",
        "paid",
        "failed",
        "refunded",
        "partially_refunded",
      ],
      default: "created",
    },
    method: {
      type: String, // upi, card, netbanking, wallet, etc.
      default: null,
    },
    bank: {
      type: String,
      default: null,
    },
    wallet: {
      type: String,
      default: null,
    },
    vpa: {
      type: String, // UPI VPA
      default: null,
    },
    email: {
      type: String,
    },
    contact: {
      type: String,
    },
    fee: {
      type: Number, // Razorpay fee
      default: 0,
    },
    tax: {
      type: Number,
      default: 0,
    },
    errorCode: {
      type: String,
      default: null,
    },
    errorDescription: {
      type: String,
      default: null,
    },
    refund: {
      refundId: String,
      amount: Number,
      status: {
        type: String,
        enum: ["pending", "processed", "failed"],
      },
      reason: String,
      processedAt: Date,
    },
    webhookEvents: [
      {
        event: String,
        payload: mongoose.Schema.Types.Mixed,
        receivedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    paidAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes
paymentSchema.index({ status: 1 });
paymentSchema.index({ createdAt: -1 });

// Hook to create earning transaction when payment is confirmed
paymentSchema.methods.createEarningTransaction = async function () {
  const EarningTransaction = require("./EarningTransaction");
  const Expert = require("./Expert");

  // Get expert's commission rate (you might want to add this to Expert model)
  const expert = await Expert.findById(this.expertId);
  const commissionRate = expert?.commissionRate || 0.8; // Default 80% to expert

  const platformFee = this.amount * (1 - commissionRate);
  const expertEarning = this.amount * commissionRate;

  const transaction = await EarningTransaction.create({
    expertId: this.expertId,
    sourceType: "session",
    sourceId: this.bookingId,
    sourceModel: "Booking",
    amount: this.amount,
    platformFee,
    expertEarning,
    currency: this.currency,
    status: "settled",
    description: `Session booking payment`,
    paymentMethod: this.method,
    paymentDetails: {
      razorpayPaymentId: this.razorpayPaymentId,
      razorpayOrderId: this.razorpayOrderId,
    },
    earnedAt: this.paidAt || new Date(),
    settledAt: new Date(),
    breakdown: {
      baseAmount: this.amount,
      discount: 0,
      tax: this.tax || 0,
      platformCommission: platformFee,
      expertShare: expertEarning,
    },
  });

  return transaction;
};

// Modify confirmPayment to create earning transaction
paymentSchema.methods.confirmPayment = async function (paymentData) {
  this.razorpayPaymentId = paymentData.razorpay_payment_id;
  this.razorpaySignature = paymentData.razorpay_signature;
  this.status = "paid";
  this.paidAt = new Date();

  if (paymentData.method) this.method = paymentData.method;
  if (paymentData.bank) this.bank = paymentData.bank;
  if (paymentData.wallet) this.wallet = paymentData.wallet;
  if (paymentData.vpa) this.vpa = paymentData.vpa;

  await this.save();

  // Create earning transaction
  await this.createEarningTransaction();

  return this;
};

// Method to mark payment as failed
paymentSchema.methods.markFailed = async function (
  errorCode,
  errorDescription,
) {
  this.status = "failed";
  this.errorCode = errorCode;
  this.errorDescription = errorDescription;
  await this.save();
  return this;
};

// Method to process refund
paymentSchema.methods.processRefund = async function (
  refundId,
  amount,
  reason,
) {
  this.status = amount < this.amount ? "partially_refunded" : "refunded";
  this.refund = {
    refundId,
    amount,
    status: "processed",
    reason,
    processedAt: new Date(),
  };
  await this.save();
  return this;
};

// Method to add webhook event
paymentSchema.methods.addWebhookEvent = async function (event, payload) {
  this.webhookEvents.push({
    event,
    payload,
    receivedAt: new Date(),
  });
  await this.save();
  return this;
};

// Static method to get payment by Razorpay order ID
paymentSchema.statics.findByRazorpayOrderId = async function (orderId) {
  return this.findOne({ razorpayOrderId: orderId });
};

// Static method to get user payment history
paymentSchema.statics.getUserPayments = async function (userId) {
  return this.find({ userId })
    .populate("bookingId", "slot status")
    .populate("expertId", "name")
    .sort({ createdAt: -1 });
};

// Static method to get expert earnings
paymentSchema.statics.getExpertEarnings = async function (
  expertId,
  startDate,
  endDate,
) {
  const query = {
    expertId,
    status: "paid",
  };

  if (startDate || endDate) {
    query.paidAt = {};
    if (startDate) query.paidAt.$gte = new Date(startDate);
    if (endDate) query.paidAt.$lte = new Date(endDate);
  }

  const payments = await this.find(query);

  const totalEarnings = payments.reduce((sum, p) => sum + p.amount, 0);
  const totalTransactions = payments.length;

  return {
    totalEarnings,
    totalTransactions,
    payments,
  };
};

module.exports = mongoose.model("Payment", paymentSchema);
