const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");

const allowedMimeTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

const storage = new CloudinaryStorage({
  cloudinary,
  params: (req, file) => {
    const originalName = file.originalname || "course-thumbnail";
    const baseName = originalName
      .replace(/\.[^/.]+$/, "")
      .replace(/[^a-zA-Z0-9-_]/g, "-");

    return {
      folder: "sansal/courses",
      resource_type: "image",
      public_id: `${Date.now()}-${baseName}`.toLowerCase(),
      allowed_formats: ["png", "jpg", "jpeg", "webp", "gif"],
    };
  },
});

const fileFilter = (req, file, cb) => {
  if (!allowedMimeTypes.has(file.mimetype)) {
    return cb(new Error("Unsupported file type"), false);
  }
  return cb(null, true);
};

const courseUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

const contentStorage = new CloudinaryStorage({
  cloudinary,
  params: (req, file) => {
    const originalName = file.originalname || "course-content";
    const baseName = originalName
      .replace(/\.[^/.]+$/, "")
      .replace(/[^a-zA-Z0-9-_]/g, "-");

    const resourceType = file.mimetype.startsWith("video/") ? "video" : "raw";

    return {
      folder: "sansal/courses/content",
      resource_type: resourceType,
      public_id: `${Date.now()}-${baseName}`.toLowerCase(),
    };
  },
});

const contentUpload = multer({
  storage: contentStorage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "video/mp4",
      "video/webm",
      "video/quicktime",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "text/plain",
      "application/zip",
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Unsupported file type"), false);
    }
  },
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB max for videos
  },
});

module.exports = { courseUpload, contentUpload };
