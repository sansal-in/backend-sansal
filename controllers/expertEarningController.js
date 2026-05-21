const { asyncHandler, AppError } = require("../middleware/errorMiddleware");
const Booking = require("../models/Booking");
const Payment = require("../models/Payment");
const EarningTransaction = require("../models/EarningTransaction");
const Payout = require("../models/Payout");
const Expert = require("../models/Expert");
const mongoose = require('mongoose');

// Helper function to get date ranges
const getDateRange = (period) => {
  const now = new Date();
  let startDate, endDate = now;
  
  switch (period) {
    case 'week':
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
      break;
    case 'month':
      startDate = new Date(now);
      startDate.setMonth(now.getMonth() - 1);
      break;
    case 'quarter':
      startDate = new Date(now);
      startDate.setMonth(now.getMonth() - 3);
      break;
    case 'year':
      startDate = new Date(now);
      startDate.setFullYear(now.getFullYear() - 1);
      break;
    case 'custom':
      // Handle custom date range from query params
      return null;
    default:
      startDate = new Date(now);
      startDate.setMonth(now.getMonth() - 1);
  }
  
  return { startDate, endDate };
};

// Get comprehensive earnings dashboard data
exports.getEarningsDashboard = asyncHandler(async (req, res) => {
  const { period = 'month', startDate: customStart, endDate: customEnd } = req.query;
  const expertId = req.expert._id;
  
  let dateFilter = {};
  if (period === 'custom' && customStart && customEnd) {
    dateFilter = {
      earnedAt: {
        $gte: new Date(customStart),
        $lte: new Date(customEnd)
      }
    };
  } else {
    const { startDate, endDate } = getDateRange(period);
    dateFilter = {
      earnedAt: { $gte: startDate, $lte: endDate }
    };
  }
  
  // Parallel queries for better performance
  const [
    overallSummary,
    periodSummary,
    pendingPayout,
    lastPayout,
    chartData,
    revenueBreakdown,
    recentTransactions,
    monthlyComparison
  ] = await Promise.all([
    // Overall earnings summary
    EarningTransaction.getEarningsSummary(expertId),
    
    // Current period summary
    EarningTransaction.getEarningsSummary(expertId, dateFilter),
    
    // Pending payout amount
    EarningTransaction.aggregate([
      {
        $match: {
          expertId: expertId,
          status: 'settled',
          payoutId: null
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$expertEarning' }
        }
      }
    ]),
    
    // Last payout
    Payout.findOne({ 
      expertId, 
      status: 'completed' 
    }).sort({ completedAt: -1 }).select('amount createdAt'),
    
    // Chart data
    EarningTransaction.getEarningsChartData(expertId, period),
    
    // Revenue breakdown percentages
    EarningTransaction.aggregate([
      {
        $match: {
          expertId: expertId,
          status: { $in: ['settled', 'paid_out'] }
        }
      },
      {
        $group: {
          _id: '$sourceType',
          total: { $sum: '$expertEarning' }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$total' },
          breakdown: { $push: { source: '$_id', amount: '$total' } }
        }
      },
      {
        $project: {
          breakdown: {
            $map: {
              input: '$breakdown',
              as: 'item',
              in: {
                source: '$$item.source',
                amount: '$$item.amount',
                percentage: {
                  $multiply: [
                    { $divide: ['$$item.amount', '$total'] },
                    100
                  ]
                }
              }
            }
          }
        }
      }
    ]),
    
    // Recent transactions with pagination
    EarningTransaction.getRecentTransactions(expertId, 10, 1),
    
    // Month-over-month comparison
    EarningTransaction.aggregate([
      {
        $match: {
          expertId: expertId,
          status: { $in: ['settled', 'paid_out'] }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$earnedAt' },
            month: { $month: '$earnedAt' }
          },
          earnings: { $sum: '$expertEarning' }
        }
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
      { $limit: 2 }
    ])
  ]);
  
  // Calculate month-over-month growth
  let growth = null;
  if (monthlyComparison.length === 2) {
    const currentMonth = monthlyComparison[0].earnings;
    const previousMonth = monthlyComparison[1].earnings;
    growth = ((currentMonth - previousMonth) / previousMonth) * 100;
  }
  
  res.status(200).json({
    success: true,
    data: {
      stats: {
        totalEarnings: overallSummary.totalEarnings || 0,
        thisMonthEarnings: periodSummary.totalEarnings || 0,
        pendingPayout: pendingPayout[0]?.total || 0,
        lastPayout: lastPayout?.amount || 0,
        totalTransactions: overallSummary.totalTransactions || 0,
        averageEarning: overallSummary.averageEarning || 0,
        monthOverMonthGrowth: growth
      },
      chartData: chartData,
      revenueBreakdown: revenueBreakdown[0]?.breakdown || [],
      recentTransactions: recentTransactions,
      period,
      currency: 'INR'
    }
  });
});

// Get detailed earnings breakdown
exports.getEarningsBreakdown = asyncHandler(async (req, res) => {
  const { period = 'month', source } = req.query;
  const expertId = req.expert._id;
  
  const dateFilter = {};
  if (period !== 'all') {
    const { startDate, endDate } = getDateRange(period);
    dateFilter.earnedAt = { $gte: startDate, $lte: endDate };
  }
  
  const matchStage = {
    expertId: expertId,
    status: { $in: ['settled', 'paid_out'] },
    ...dateFilter
  };
  
  if (source) {
    matchStage.sourceType = source;
  }
  
  const breakdown = await EarningTransaction.aggregate([
    { $match: matchStage },
    {
      $facet: {
        bySource: [
          {
            $group: {
              _id: '$sourceType',
              total: { $sum: '$expertEarning' },
              count: { $sum: 1 },
              average: { $avg: '$expertEarning' }
            }
          }
        ],
        byMonth: [
          {
            $group: {
              _id: {
                year: { $year: '$earnedAt' },
                month: { $month: '$earnedAt' }
              },
              total: { $sum: '$expertEarning' },
              count: { $sum: 1 }
            }
          },
          { $sort: { '_id.year': -1, '_id.month': -1 } }
        ],
        summary: [
          {
            $group: {
              _id: null,
              totalEarnings: { $sum: '$expertEarning' },
              totalTransactions: { $sum: 1 },
              minEarning: { $min: '$expertEarning' },
              maxEarning: { $max: '$expertEarning' },
              avgEarning: { $avg: '$expertEarning' }
            }
          }
        ]
      }
    }
  ]);
  
  res.status(200).json({
    success: true,
    data: breakdown[0]
  });
});

// Get recent transactions with detailed filtering
exports.getTransactions = asyncHandler(async (req, res) => {
  const { 
    page = 1, 
    limit = 10, 
    status, 
    sourceType,
    startDate,
    endDate,
    sortBy = 'earnedAt',
    sortOrder = 'desc'
  } = req.query;
  
  const expertId = req.expert._id;
  
  // Build filter
  const filter = { expertId };
  
  if (status) {
    filter.status = status;
  }
  
  if (sourceType) {
    filter.sourceType = sourceType;
  }
  
  if (startDate || endDate) {
    filter.earnedAt = {};
    if (startDate) filter.earnedAt.$gte = new Date(startDate);
    if (endDate) filter.earnedAt.$lte = new Date(endDate);
  }
  
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const sortOptions = {};
  sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;
  
  const [transactions, total] = await Promise.all([
    EarningTransaction.find(filter)
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('sourceId', 'slot sessionType courseName resourceName')
      .lean(),
    EarningTransaction.countDocuments(filter)
  ]);
  
  res.status(200).json({
    success: true,
    data: {
      transactions,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    }
  });
});

// Get single transaction details
exports.getTransactionDetails = asyncHandler(async (req, res) => {
  const { transactionId } = req.params;
  const expertId = req.expert._id;
  
  const transaction = await EarningTransaction.findOne({
    _id: transactionId,
    expertId
  }).populate({
    path: 'sourceId',
    select: 'slot sessionType amount status paymentMode courseName resourceName',
    populate: {
      path: 'userId',
      select: 'displayName email'
    }
  });
  
  if (!transaction) {
    throw new AppError('Transaction not found', 404);
  }
  
  // Get related payout info if exists
  let payout = null;
  if (transaction.payoutId) {
    payout = await Payout.findById(transaction.payoutId)
      .select('payoutNumber status processedAt');
  }
  
  res.status(200).json({
    success: true,
    data: {
      transaction,
      payout
    }
  });
});

// Get earnings chart data
exports.getEarningsChart = asyncHandler(async (req, res) => {
  const { period = 'month', source } = req.query;
  const expertId = req.expert._id;
  
  const matchStage = {
    expertId: expertId,
    status: { $in: ['settled', 'paid_out'] }
  };
  
  if (source) {
    matchStage.sourceType = source;
  }
  
  const chartData = await EarningTransaction.getEarningsChartData(expertId, period);
  
  res.status(200).json({
    success: true,
    data: chartData
  });
});

// Request payout
exports.requestPayout = asyncHandler(async (req, res) => {
  const expertId = req.expert._id;
  const { amount, method, destination } = req.body;
  
  // Get available balance
  const availableBalance = await EarningTransaction.aggregate([
    {
      $match: {
        expertId,
        status: 'settled',
        payoutId: null
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$expertEarning' }
      }
    }
  ]);
  
  const balance = availableBalance[0]?.total || 0;
  
  if (amount > balance) {
    throw new AppError('Insufficient balance', 400);
  }
  
  // Check minimum payout amount
  const MIN_PAYOUT = 500; // ₹500 minimum
  if (amount < MIN_PAYOUT) {
    throw new AppError(`Minimum payout amount is ₹${MIN_PAYOUT}`, 400);
  }
  
  // Get pending earnings to be included in this payout
  const pendingTransactions = await EarningTransaction.find({
    expertId,
    status: 'settled',
    payoutId: null
  }).sort({ earnedAt: 1 });
  
  // Calculate which transactions to include
  let runningTotal = 0;
  const includedTransactions = [];
  
  for (const transaction of pendingTransactions) {
    if (runningTotal + transaction.expertEarning <= amount) {
      runningTotal += transaction.expertEarning;
      includedTransactions.push(transaction._id);
    } else {
      break;
    }
  }
  
  // Create payout request
  const payout = await Payout.create({
    expertId,
    amount: runningTotal,
    currency: 'INR',
    method,
    destination,
    transactions: includedTransactions,
    period: {
      startDate: pendingTransactions[pendingTransactions.length - 1]?.earnedAt,
      endDate: pendingTransactions[0]?.earnedAt
    },
    fees: {
      processingFee: 0, // Calculate based on method
      tax: 0,
      netAmount: runningTotal
    },
    status: 'pending'
  });
  
  // Update transactions with payout reference
  await EarningTransaction.updateMany(
    { _id: { $in: includedTransactions } },
    { 
      $set: { 
        payoutId: payout._id,
        status: 'paid_out',
        payoutDate: new Date()
      }
    }
  );
  
  // Notify admin about payout request (implement notification service)
  // await NotificationService.notifyAdmin('payout_request', { payout });
  
  res.status(201).json({
    success: true,
    data: {
      payout,
      message: 'Payout request submitted successfully'
    }
  });
});

// Get payout history
exports.getPayoutHistory = asyncHandler(async (req, res) => {
  const expertId = req.expert._id;
  const { page = 1, limit = 10 } = req.query;
  
  const skip = (parseInt(page) - 1) * parseInt(limit);
  
  const [payouts, total] = await Promise.all([
    Payout.find({ expertId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('-destination.accountNumber') // Exclude sensitive data
      .lean(),
    Payout.countDocuments({ expertId })
  ]);
  
  res.status(200).json({
    success: true,
    data: {
      payouts,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total
      }
    }
  });
});

// Get payout details
exports.getPayoutDetails = asyncHandler(async (req, res) => {
  const { payoutId } = req.params;
  const expertId = req.expert._id;
  
  const payout = await Payout.findOne({
    _id: payoutId,
    expertId
  }).populate('transactions');
  
  if (!payout) {
    throw new AppError('Payout not found', 404);
  }
  
  res.status(200).json({
    success: true,
    data: payout
  });
});

// Get revenue breakdown percentages
exports.getRevenueBreakdown = asyncHandler(async (req, res) => {
  const expertId = req.expert._id;
  const { period = 'all' } = req.query;
  
  const dateFilter = {};
  if (period !== 'all') {
    const { startDate, endDate } = getDateRange(period);
    dateFilter.earnedAt = { $gte: startDate, $lte: endDate };
  }
  
  const breakdown = await EarningTransaction.aggregate([
    {
      $match: {
        expertId,
        status: { $in: ['settled', 'paid_out'] },
        ...dateFilter
      }
    },
    {
      $group: {
        _id: '$sourceType',
        total: { $sum: '$expertEarning' }
      }
    },
    {
      $group: {
        _id: null,
        totalEarnings: { $sum: '$total' },
        sources: {
          $push: {
            type: '$_id',
            amount: '$total'
          }
        }
      }
    },
    {
      $project: {
        breakdown: {
          $map: {
            input: '$sources',
            as: 'source',
            in: {
              type: '$$source.type',
              amount: '$$source.amount',
              percentage: {
                $cond: [
                  { $eq: ['$totalEarnings', 0] },
                  0,
                  { $round: [{ $multiply: [{ $divide: ['$$source.amount', '$totalEarnings'] }, 100] }, 2] }
                ]
              }
            }
          }
        }
      }
    },
    {
      $replaceRoot: { newRoot: { $arrayToObject: { $map: { input: '$breakdown', as: 'b', in: { k: '$$b.type', v: '$$b' } } } } }
    }
  ]);
  
  res.status(200).json({
    success: true,
    data: breakdown[0] || {}
  });
});

// Get earnings analytics
exports.getEarningsAnalytics = asyncHandler(async (req, res) => {
  const expertId = req.expert._id;
  
  const analytics = await EarningTransaction.aggregate([
    {
      $match: {
        expertId,
        status: { $in: ['settled', 'paid_out'] }
      }
    },
    {
      $facet: {
        // Top performing months
        topMonths: [
          {
            $group: {
              _id: {
                year: { $year: '$earnedAt' },
                month: { $month: '$earnedAt' }
              },
              earnings: { $sum: '$expertEarning' },
              transactions: { $sum: 1 }
            }
          },
          { $sort: { earnings: -1 } },
          { $limit: 5 }
        ],
        // Weekly averages
        weeklyAverage: [
          {
            $group: {
              _id: { week: { $week: '$earnedAt' }, year: { $year: '$earnedAt' } },
              weeklyEarnings: { $sum: '$expertEarning' }
            }
          },
          {
            $group: {
              _id: null,
              averageWeeklyEarnings: { $avg: '$weeklyEarnings' }
            }
          }
        ],
        // Earnings trend (last 6 months)
        trend: [
          {
            $match: {
              earnedAt: {
                $gte: new Date(new Date().setMonth(new Date().getMonth() - 6))
              }
            }
          },
          {
            $group: {
              _id: {
                year: { $year: '$earnedAt' },
                month: { $month: '$earnedAt' }
              },
              earnings: { $sum: '$expertEarning' }
            }
          },
          { $sort: { '_id.year': 1, '_id.month': 1 } }
        ],
        // Platform fee summary
        platformFees: [
          {
            $group: {
              _id: null,
              totalFees: { $sum: '$platformFee' },
              totalEarnings: { $sum: '$expertEarning' }
            }
          }
        ]
      }
    }
  ]);
  
  res.status(200).json({
    success: true,
    data: analytics[0]
  });
});