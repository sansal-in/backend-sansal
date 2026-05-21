const express = require('express');
const router = express.Router();
const codingController = require('../controllers/codingController');
const codingExecuteController = require('../controllers/codingExecuteController');
const { authMiddleware } = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.post('/submissions', codingController.createSubmission);
router.get('/submissions', codingController.getSubmissions);
router.get('/submissions/stats', codingController.getStats);
router.get('/submissions/:id', codingController.getSubmission);

router.post('/execute', codingExecuteController.execute);
router.get('/languages', codingExecuteController.listLanguages);

module.exports = router;
