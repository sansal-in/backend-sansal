const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: '',
    trim: true
  },
  category: {
    type: String,
    default: '',
    trim: true
  },
  subject: {
    type: String,
    default: '',
    trim: true
  },
  semester: {
    type: String,
    default: '',
    trim: true
  },
  year: {
    type: String,
    default: '',
    trim: true
  },
  domain: {
    type: String,
    default: '',
    trim: true
  },
  track: {
    type: String,
    default: '',
    trim: true
  },
  technology: {
    type: String,
    default: '',
    trim: true
  },
  tags: {
    type: [String],
    default: []
  },
  fileUrl: {
    type: String,
    required: true
  },
  filePublicId: {
    type: String,
    default: ''
  },
  fileResourceType: {
    type: String,
    default: ''
  },
  fileName: {
    type: String,
    required: true
  },
  fileType: {
    type: String,
    default: ''
  },
  fileSize: {
    type: Number,
    default: 0
  },
  uploader: {
    id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    name: {
      type: String,
      default: ''
    },
    role: {
      type: String,
      enum: ['student', 'expert', 'admin'],
      default: 'student'
    }
  },
  visibility: {
    type: String,
    enum: ['public', 'private'],
    default: 'public'
  }
}, {
  timestamps: true
});

noteSchema.index({ createdAt: -1 });
noteSchema.index({
  title: 'text',
  description: 'text',
  subject: 'text',
  category: 'text',
  semester: 'text',
  year: 'text',
  domain: 'text',
  track: 'text',
  technology: 'text',
  authorName: 'text',
  tags: 'text'
});

const Note = mongoose.model('Note', noteSchema);

module.exports = Note;
