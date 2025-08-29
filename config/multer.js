// uploads/multer.js
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const ApiError = require("../utils/ApiError");

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function sanitizeId(id = "") {
  const safe = String(id).replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safe) throw new ApiError("Invalid user id");
  return safe;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
       const userId = sanitizeId(req.user?.id || req.params.userId);
      const tmpDir = path.join("uploads", "users", userId, "pins", "_incoming");
      ensureDir(tmpDir);
      cb(null, tmpDir); 
    } catch (e) { cb(e); }
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || "";
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 }, 
  fileFilter: (_req, file, cb) => {
    const images = ["image/jpeg", "image/png"];
    const videos = ["video/mp4", "video/mpeg", "video/quicktime"];
    if (images.includes(file.mimetype)) { file.sizeLimit = 20 * 1024 * 1024; return cb(null, true); }
    if (videos.includes(file.mimetype)) { file.sizeLimit = 200 * 1024 * 1024; return cb(null, true); }
    cb(new ApiError("Only JPG, PNG, MP4, MPEG, MOV allowed"));
  },
});

module.exports = { upload };
