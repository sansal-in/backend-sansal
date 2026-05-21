const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');
const path = require('path');

const allowedMimeTypes = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif'
]);

const storage = new CloudinaryStorage({
  cloudinary,
  params: (req, file) => {
    const originalName = file.originalname || 'avatar';
    const extension = path.extname(originalName).toLowerCase().replace('.', '');
    const baseName = originalName
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9-_]/g, '-');

    return {
      folder: 'sansal/avatars',
      resource_type: 'image',
      public_id: `${Date.now()}-${baseName}`.toLowerCase(),
      allowed_formats: ['png', 'jpg', 'jpeg', 'webp', 'gif']
    };
  }
});

const fileFilter = (req, file, cb) => {
  if (!allowedMimeTypes.has(file.mimetype)) {
    return cb(new Error('Unsupported file type'), false);
  }
  return cb(null, true);
};

const avatarUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});

module.exports = { avatarUpload };
