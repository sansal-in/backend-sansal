const express = require('express');
const router = express.Router();
const { verifyExpertToken } = require('../middleware/auth');
const {
  getEarningsDashboard,
  getEarningsBreakdown,
  getTransactions,
  getTransactionDetails,
  getEarningsChart,
  requestPayout,
  getPayoutHistory,
  getPayoutDetails,
  getRevenueBreakdown,
  getEarningsAnalytics
} = require('../controllers/expertEarningController');

// All routes require expert authentication
router.use(verifyExpertToken);

// Dashboard and overview
router.get('/dashboard', getEarningsDashboard);
router.get('/analytics', getEarningsAnalytics);

// Earnings data
router.get('/breakdown', getEarningsBreakdown);
router.get('/chart', getEarningsChart);
router.get('/revenue-breakdown', getRevenueBreakdown);

// Transactions
router.get('/transactions', getTransactions);
router.get('/transactions/:transactionId', getTransactionDetails);

// Payouts
router.get('/payouts', getPayoutHistory);
router.get('/payouts/:payoutId', getPayoutDetails);
router.post('/payouts/request', requestPayout);

// Legacy route for backward compatibility
router.get('/', getEarningsDashboard);

module.exports = router;