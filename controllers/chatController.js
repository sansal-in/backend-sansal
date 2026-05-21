const Chat = require('../models/Chat');
const Message = require('../models/Message');
const Expert = require('../models/Expert');
const User = require('../models/User');

const buildChatResponse = (chat, userId) => {
  const unreadCount = chat.unreadCounts?.get?.(userId.toString()) ?? chat.unreadCounts?.[userId.toString()] ?? 0;
  return {
    _id: chat._id,
    student: chat.student,
    expert: chat.expert,
    expertProfile: chat.expertProfile,
    participants: chat.participants,
    lastMessage: chat.lastMessage,
    unreadCount,
    updatedAt: chat.updatedAt
  };
};

const ensureParticipant = (chat, userId) => {
  return chat.participants.some((id) => id.toString() === userId.toString());
};

exports.listChats = async (req, res) => {
  try {
    const userId = req.user._id;
    const chats = await Chat.find({ participants: userId })
      .sort({ updatedAt: -1 })
      .populate('student', 'displayName email photoURL')
      .populate('expert', 'displayName email photoURL')
      .populate('expertProfile', 'name specialization avatar');

    res.status(200).json({
      success: true,
      chats: chats.map((chat) => buildChatResponse(chat, userId))
    });
  } catch (error) {
    console.error('List chats error:', error);
    res.status(500).json({ success: false, message: 'Failed to load chats' });
  }
};

exports.startChat = async (req, res) => {
  try {
    const userId = req.user._id;
    const { expertId } = req.body;

    if (!expertId) {
      return res.status(400).json({ success: false, message: 'Expert ID is required' });
    }

    const expertProfile = await Expert.findById(expertId).populate('user', 'displayName email photoURL');
    if (!expertProfile) {
      return res.status(404).json({ success: false, message: 'Expert not found' });
    }

    let expertUser = expertProfile.user;
    if (!expertUser) {
      const lookup = [];
      if (expertProfile.firebaseUid) lookup.push({ firebaseUid: expertProfile.firebaseUid });
      if (expertProfile.email) lookup.push({ email: expertProfile.email.toLowerCase() });

      if (lookup.length > 0) {
        expertUser = await User.findOne({ $or: lookup });
      }

      if (expertUser) {
        expertProfile.user = expertUser._id;
        await expertProfile.save();
      }
    }

    if (!expertUser) {
      return res.status(404).json({ success: false, message: 'Expert account not linked' });
    }

    const expertUserId = expertUser._id;
    if (expertUserId.toString() === userId.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot chat with yourself' });
    }

    let chat = await Chat.findOne({ student: userId, expert: expertUserId });
    if (!chat) {
      try {
        chat = await Chat.create({
          student: userId,
          expert: expertUserId,
          expertProfile: expertProfile._id,
          participants: [userId, expertUserId],
          unreadCounts: {
            [userId.toString()]: 0,
            [expertUserId.toString()]: 0
          }
        });
      } catch (error) {
        if (error?.code === 11000) {
          chat = await Chat.findOne({ student: userId, expert: expertUserId });
        } else {
          throw error;
        }
      }
    }

    const populatedChat = await Chat.findById(chat._id)
      .populate('student', 'displayName email photoURL')
      .populate('expert', 'displayName email photoURL')
      .populate('expertProfile', 'name specialization avatar');

    res.status(200).json({
      success: true,
      chat: buildChatResponse(populatedChat, userId)
    });
  } catch (error) {
    console.error('Start chat error:', error);
    res.status(500).json({ success: false, message: 'Failed to start chat' });
  }
};

exports.getMessages = async (req, res) => {
  try {
    const userId = req.user._id;
    const { chatId } = req.params;
    const limit = Math.min(Number(req.query.limit) || 50, 200);

    const chat = await Chat.findById(chatId);
    if (!chat || !ensureParticipant(chat, userId)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const messages = await Message.find({ chat: chatId })
      .sort({ createdAt: 1 })
      .limit(limit);

    res.status(200).json({ success: true, messages });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ success: false, message: 'Failed to load messages' });
  }
};

exports.markRead = async (req, res) => {
  try {
    const userId = req.user._id;
    const { chatId } = req.params;

    const chat = await Chat.findById(chatId);
    if (!chat || !ensureParticipant(chat, userId)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    chat.unreadCounts.set(userId.toString(), 0);
    await chat.save();

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ success: false, message: 'Failed to update chat' });
  }
};

exports.uploadChatFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const isImage = req.file.mimetype?.startsWith('image/');
    const fileUrl = req.file.secure_url || req.file.path;

    res.status(200).json({
      success: true,
      attachment: {
        url: fileUrl,
        name: req.file.originalname,
        size: req.file.size,
        contentType: req.file.mimetype,
        type: isImage ? 'image' : 'file'
      }
    });
  } catch (error) {
    console.error('Upload chat file error:', error);
    res.status(500).json({ success: false, message: 'Failed to upload file' });
  }
};
