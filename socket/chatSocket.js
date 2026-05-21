const { Server } = require('socket.io');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const User = require('../models/User');
const { verifyToken } = require('../utils/token');

const buildChatSummary = (chat) => ({
  _id: chat._id,
  student: chat.student,
  expert: chat.expert,
  expertProfile: chat.expertProfile,
  participants: chat.participants,
  lastMessage: chat.lastMessage,
  unreadCounts: chat.unreadCounts,
  updatedAt: chat.updatedAt
});

const ensureParticipant = (chat, userId) => {
  return chat.participants.some((id) => id.toString() === userId.toString());
};

const initChatSocket = (server, allowedOrigins = []) => {
  const io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      credentials: true
    }
  });

  io.engine.on('connection_error', (err) => {
    console.error('Socket connection error:', err.code, err.message);
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) return next(new Error('Unauthorized'));

      const decoded = verifyToken(token);
      if (!decoded?.userId) return next(new Error('Unauthorized'));

      const user = await User.findById(decoded.userId);
      if (!user) return next(new Error('Unauthorized'));

      socket.user = user;
      next();
    } catch (error) {
      console.error('Socket auth error:', error.message || error);
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user._id.toString();
    socket.join(`user:${userId}`);

    socket.on('joinChat', async ({ chatId }) => {
      try {
        if (!chatId) return;
        const chat = await Chat.findById(chatId);
        if (!chat || !ensureParticipant(chat, userId)) return;
        socket.join(`chat:${chatId}`);
      } catch (error) {
        // Ignore join errors
      }
    });

    socket.on('sendMessage', async (payload, callback) => {
      try {
        const { chatId, text = '', attachment = null } = payload || {};
        if (!chatId || (!text?.trim() && !attachment)) {
          if (callback) callback({ success: false, message: 'Empty message' });
          return;
        }

        const chat = await Chat.findById(chatId);
        if (!chat || !ensureParticipant(chat, userId)) {
          if (callback) callback({ success: false, message: 'Access denied' });
          return;
        }

        const recipientId = chat.participants.find((id) => id.toString() !== userId.toString());

        const message = await Message.create({
          chat: chatId,
          sender: userId,
          recipient: recipientId,
          text: text || '',
          attachment: attachment || null
        });

        const lastMessageText = text?.trim()
          ? text.trim()
          : attachment?.type === 'image'
            ? 'Image'
            : attachment?.name
              ? `File: ${attachment.name}`
              : 'Attachment';

        chat.lastMessage = {
          text: lastMessageText,
          type: attachment?.type || 'text',
          sender: userId,
          createdAt: new Date()
        };

        const recipientKey = recipientId.toString();
        const senderKey = userId.toString();
        const currentCount = chat.unreadCounts.get(recipientKey) || 0;
        chat.unreadCounts.set(recipientKey, currentCount + 1);
        chat.unreadCounts.set(senderKey, 0);

        await chat.save();

        const populatedChat = await Chat.findById(chatId)
          .populate('student', 'displayName email photoURL')
          .populate('expert', 'displayName email photoURL')
          .populate('expertProfile', 'name specialization avatar');

        const messagePayload = {
          _id: message._id,
          chat: message.chat,
          sender: message.sender,
          recipient: message.recipient,
          text: message.text,
          attachment: message.attachment,
          createdAt: message.createdAt
        };

        io.to(`chat:${chatId}`).emit('message:new', messagePayload);
        io.to(`user:${recipientKey}`).emit('chat:updated', buildChatSummary(populatedChat));
        io.to(`user:${senderKey}`).emit('chat:updated', buildChatSummary(populatedChat));

        if (callback) callback({ success: true, message: messagePayload });
      } catch (error) {
        if (callback) callback({ success: false, message: 'Failed to send message' });
      }
    });

    socket.on('markRead', async ({ chatId }) => {
      try {
        if (!chatId) return;
        const chat = await Chat.findById(chatId);
        if (!chat || !ensureParticipant(chat, userId)) return;
        chat.unreadCounts.set(userId.toString(), 0);
        await chat.save();
        io.to(`user:${userId}`).emit('chat:updated', buildChatSummary(chat));
      } catch (error) {
        // Ignore errors
      }
    });
  });

  return io;
};

module.exports = { initChatSocket };
