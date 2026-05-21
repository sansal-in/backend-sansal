const mongoose = require('mongoose');

const courseAnnouncementSchema = new mongoose.Schema({
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true,
    index: true
  },
  expertId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Expert',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  }
}, {
  timestamps: true
});

courseAnnouncementSchema.index({ createdAt: -1 });

module.exports = mongoose.model('CourseAnnouncement', courseAnnouncementSchema);
