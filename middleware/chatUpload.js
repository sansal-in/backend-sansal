const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');
const path = require('path');

const allowedMimeTypes = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp'
]);

const storage = new CloudinaryStorage({
  cloudinary,
  params: (req, file) => {
    const originalName = file.originalname || 'chat-file';
    const extension = path.extname(originalName).toLowerCase().replace('.', '');
    const baseName = originalName
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9-_]/g, '-');

    const isImage = file.mimetype.startsWith('image/');
    const isPdf = file.mimetype === 'application/pdf';
    const resourceType = isImage || isPdf ? 'image' : 'raw';

    return {
      folder: 'sansal/chats',
      resource_type: resourceType,
      public_id: `${Date.now()}-${baseName}`.toLowerCase(),
      use_filename: true,
      unique_filename: true,
      format: extension || undefined,
      allowed_formats: ['pdf', 'png', 'jpg', 'jpeg', 'webp']
    };
  }
});

const fileFilter = (req, file, cb) => {
  if (!allowedMimeTypes.has(file.mimetype)) {
    return cb(new Error('Unsupported file type'), false);
  }
  return cb(null, true);
};

const chatUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

module.exports = { chatUpload };
