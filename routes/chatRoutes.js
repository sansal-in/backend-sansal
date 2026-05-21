const express = require('express');
const {
  listChats,
  startChat,
  getMessages,
  markRead,
  uploadChatFile
} = require('../controllers/chatController');
const { requireChatAuth } = require('../middleware/chatAuth');
const { chatUpload } = require('../middleware/chatUpload');

const router = express.Router();

router.get('/', requireChatAuth, listChats);
router.post('/start', requireChatAuth, startChat);
router.get('/:chatId/messages', requireChatAuth, getMessages);
router.post('/:chatId/read', requireChatAuth, markRead);
router.post('/upload', requireChatAuth, chatUpload.single('file'), uploadChatFile);

module.exports = router;
