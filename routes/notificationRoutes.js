const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/authMiddleware');
const notificationController = require('../controllers/notificationController');

router.get('/', authMiddleware, notificationController.listNotifications);
router.patch('/:id/read', authMiddleware, notificationController.markRead);
router.patch('/:id/unread', authMiddleware, notificationController.markUnread);
router.delete('/:id', authMiddleware, notificationController.clearNotification);
router.delete('/', authMiddleware, notificationController.clearAllNotifications);

module.exports = router;
