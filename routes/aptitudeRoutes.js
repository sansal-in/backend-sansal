const express = require('express');
const router = express.Router();
const aptitudeController = require('../controllers/aptitudeController');
const { authMiddleware } = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.post('/attempts', aptitudeController.createAttempt);
router.get('/attempts', aptitudeController.getAttempts);
router.get('/attempts/:id', aptitudeController.getAttempt);

module.exports = router;
