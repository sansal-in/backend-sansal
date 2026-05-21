const mongoose = require("mongoose");

const earningTransactionSchema = new mongoose.Schema(
  {
    expertId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Expert",
      required: true,
      index: true,
    },
    sourceType: {
      type: String,
      enum: ["session", "course", "resource", "referral", "bonus"],
      required: true,
      index: true,
    },
    sourceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "sourceModel",
    },
    sourceModel: {
      type: String,
      required: true,
      enum: ["Booking", "CourseEnrollment", "ResourcePurchase"],
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    platformFee: {
      type: Number,
      default: 0,
    },
    expertEarning: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: "INR",
    },
    status: {
      type: String,
      enum: ["pending", "settled", "paid_out", "cancelled", "refunded"],
      default: "pending",
      index: true,
    },
    payoutId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payout",
      default: null,
    },
    payoutDate: Date,
    description: String,
    paymentMethod: String,
    paymentDetails: mongoose.Schema.Types.Mixed,
    earnedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    settledAt: Date,
    breakdown: {
      baseAmount: Number,
      discount: { type: Number, default: 0 },
      tax: { type: Number, default: 0 },
      platformCommission: Number,
      expertShare: Number,
    },
  },
  {
    timestamps: true,
  },
);

// Compound indexes
earningTransactionSchema.index({ expertId: 1, earnedAt: -1 });
earningTransactionSchema.index({ expertId: 1, status: 1 });
earningTransactionSchema.index({ expertId: 1, sourceType: 1, earnedAt: -1 });
earningTransactionSchema.index({ payoutId: 1 });

// Virtual for net earning
earningTransactionSchema.virtual("netEarning").get(function () {
  return this.expertEarning;
});

// Static method to get expert earnings summary
earningTransactionSchema.statics.getEarningsSummary = async function (
  expertId,
  dateFilter = {},
) {
  const ObjectId = mongoose.Types.ObjectId;

  const matchStage = {
    expertId: new ObjectId(expertId),
    status: { $in: ["settled", "paid_out"] },
    ...dateFilter,
  };

  const summary = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalEarnings: { $sum: "$expertEarning" },
        totalTransactions: { $sum: 1 },
        averageEarning: { $avg: "$expertEarning" },
        bySource: {
          $push: {
            sourceType: "$sourceType",
            amount: "$expertEarning",
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        totalEarnings: 1,
        totalTransactions: 1,
        averageEarning: { $round: ["$averageEarning", 2] },
        revenueBreakdown: {
          $reduce: {
            input: "$bySource",
            initialValue: {
              session: 0,
              course: 0,
              resource: 0,
              referral: 0,
              bonus: 0,
            },
            in: {
              $mergeObjects: [
                "$$value",
                {
                  $arrayToObject: [
                    [
                      {
                        k: "$$this.sourceType",
                        v: {
                          $add: [
                            {
                              $ifNull: [
                                {
                                  $getField: {
                                    field: "$$this.sourceType",
                                    input: "$$value",
                                  },
                                },
                                0,
                              ],
                            },
                            "$$this.amount",
                          ],
                        },
                      },
                    ],
                  ],
                },
              ],
            },
          },
        },
      },
    },
  ]);

  return (
    summary[0] || {
      totalEarnings: 0,
      totalTransactions: 0,
      averageEarning: 0,
      revenueBreakdown: {
        session: 0,
        course: 0,
        resource: 0,
        referral: 0,
        bonus: 0,
      },
    }
  );
};

// Static method to get chart data
earningTransactionSchema.statics.getEarningsChartData = async function (
  expertId,
  period,
) {
  const ObjectId = mongoose.Types.ObjectId;

  const dateFormat =
    period === "week" ? "%Y-%m-%d" : period === "month" ? "%Y-%m" : "%Y";

  const groupBy =
    period === "week"
      ? { $dateToString: { format: "%Y-%m-%d", date: "$earnedAt" } }
      : period === "month"
        ? { $dateToString: { format: "%Y-%m", date: "$earnedAt" } }
        : { $dateToString: { format: "%Y", date: "$earnedAt" } };

  const chartData = await this.aggregate([
    {
      $match: {
        expertId: new ObjectId(expertId),
        status: { $in: ["settled", "paid_out"] },
      },
    },
    {
      $group: {
        _id: groupBy,
        earnings: { $sum: "$expertEarning" },
        transactions: { $sum: 1 },
        bySource: {
          $push: {
            sourceType: "$sourceType",
            amount: "$expertEarning",
          },
        },
      },
    },
    {
      $project: {
        date: "$_id",
        earnings: 1,
        transactions: 1,
        sourceBreakdown: {
          $reduce: {
            input: "$bySource",
            initialValue: {},
            in: {
              $mergeObjects: [
                "$$value",
                {
                  $arrayToObject: [
                    [
                      {
                        k: "$$this.sourceType",
                        v: {
                          $add: [
                            {
                              $ifNull: [
                                {
                                  $getField: {
                                    field: "$$this.sourceType",
                                    input: "$$value",
                                  },
                                },
                                0,
                              ],
                            },
                            "$$this.amount",
                          ],
                        },
                      },
                    ],
                  ],
                },
              ],
            },
          },
        },
      },
    },
    { $sort: { date: 1 } },
  ]);

  return chartData;
};

// Static method to get recent transactions
earningTransactionSchema.statics.getRecentTransactions = async function (
  expertId,
  limit = 10,
  page = 1,
) {
  const ObjectId = mongoose.Types.ObjectId;
  const skip = (page - 1) * limit;

  const transactions = await this.find({
    expertId: new ObjectId(expertId),
    status: { $in: ["settled", "paid_out", "pending"] },
  })
    .sort({ earnedAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate("sourceId", "slot sessionType courseName resourceName")
    .lean();

  const total = await this.countDocuments({
    expertId: new ObjectId(expertId),
    status: { $in: ["settled", "paid_out", "pending"] },
  });

  return {
    transactions,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalItems: total,
      itemsPerPage: limit,
    },
  };
};

const EarningTransaction = mongoose.model(
  "EarningTransaction",
  earningTransactionSchema,
);
module.exports = EarningTransaction;
