// src/middleware/upload.js
import multer from "multer";
import path from "path";
import fs from "fs";

const UPLOAD_DIR = "uploads";

// Ensure uploads folder exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// keep ext if present (avoid weird/long extensions)
function safeExt(originalname = "") {
  const ext = path.extname(originalname).toLowerCase();
  if (!ext || ext.length > 10) return "";
  return ext;
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = safeExt(file.originalname) || "";
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${ext}`);
  },
});

// ✅ Allow ALL image formats (png/jpg/jpeg/webp/heic/heif/gif/bmp/tiff/etc.)
function fileFilter(_req, file, cb) {
  const mimetype = String(file.mimetype || "").toLowerCase();

  // Key rule: any image/*
  if (mimetype.startsWith("image/")) {
    return cb(null, true);
  }

  return cb(new Error("Only image files are allowed"));
}

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 8 * 1024 * 1024, // 8MB (set back to 5MB if you prefer)
  },
});