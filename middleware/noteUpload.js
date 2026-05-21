const multer = require("multer");
const path = require("path");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");

const allowedMimeTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "image/png",
  "image/jpeg",
  "image/jpg",
]);

const fileFilter = (req, file, cb) => {
  if (allowedMimeTypes.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Invalid file type. Only PDF, DOC, DOCX, PPT, PPTX, TXT, PNG, JPG, JPEG are allowed.",
      ),
      false,
    );
  }
};

// Configure Cloudinary storage
const storage = new CloudinaryStorage({
  cloudinary,
  params: (req, file) => {
    const originalName = file.originalname || "note";
    const extension = path.extname(originalName).toLowerCase().replace(".", "");
    const baseName = originalName
      .replace(/\.[^/.]+$/, "")
      .replace(/[^a-zA-Z0-9-_]/g, "-");

    // 🔥 Decide resource type dynamically
    let resourceType = "raw";

    if (
      file.mimetype === "application/pdf" ||
      file.mimetype.startsWith("image/")
    ) {
      resourceType = "image";
    }

    return {
      folder: "sansal/notes",
      resource_type: resourceType,
      public_id: `${Date.now()}-${baseName}`.toLowerCase(),
      allowed_formats: [
        "pdf",
        "doc",
        "docx",
        "ppt",
        "pptx",
        "txt",
        "png",
        "jpg",
        "jpeg",
      ],
    };
  },
});

const noteUpload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
});

module.exports = { noteUpload };
