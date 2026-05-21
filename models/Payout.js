const mongoose = require('mongoose');

const payoutSchema = new mongoose.Schema({
  expertId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Expert',
    required: true,
    index: true
  },
  payoutNumber: {
    type: String,
    unique: true
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
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
    default: 'pending',
    index: true
  },
  method: {
    type: String,
    enum: ['bank_transfer', 'upi', 'paypal'],
    required: true
  },
  destination: {
    // Bank details
    accountHolderName: String,
    accountNumber: String,
    ifscCode: String,
    bankName: String,
    // UPI
    upiId: String,
    // PayPal
    paypalEmail: String
  },
  transactions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EarningTransaction'
  }],
  period: {
    startDate: Date,
    endDate: Date
  },
  fees: {
    processingFee: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    netAmount: Number
  },
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  processedAt: Date,
  failureReason: String,
  notes: String,
  metadata: mongoose.Schema.Types.Mixed
}, {
  timestamps: true
});

// Auto-generate payout number
payoutSchema.pre('save', async function(next) {
  if (this.isNew && !this.payoutNumber) {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const count = await this.constructor.countDocuments({
      createdAt: {
        $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      }
    });
    
    this.payoutNumber = `PO-${year}${month}-${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

// Indexes
payoutSchema.index({ expertId: 1, createdAt: -1 });

module.exports = mongoose.model('Payout', payoutSchema);