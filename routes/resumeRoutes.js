const express = require('express');
const { authMiddleware } = require('../middleware/authMiddleware');
const { getResume, saveResume } = require('../controllers/resumeController');

const router = express.Router();

router.use(authMiddleware);

router.get('/', getResume);
router.put('/', saveResume);

module.exports = router;
