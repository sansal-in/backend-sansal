const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    expert: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    expertProfile: { type: mongoose.Schema.Types.ObjectId, ref: 'Expert', required: true },
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
    lastMessage: {
      text: { type: String, default: '' },
      type: { type: String, enum: ['text', 'image', 'file'], default: 'text' },
      sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      createdAt: { type: Date }
    },
    unreadCounts: { type: Map, of: Number, default: {} }
  },
  { timestamps: true }
);

chatSchema.index({ student: 1, expert: 1 }, { unique: true });
chatSchema.index({ participants: 1, updatedAt: -1 });

module.exports = mongoose.model('Chat', chatSchema);
