const ApiError = require("../utils/ApiError");
const asyncErrorHandler = require("../utils/asyncErrorHandler");
const Pin = require("../models/pin.model");
const { toPosix } = require("../utils/mediaUtils");
const path = require("path");
const fs = require("fs");
const fsp = fs.promises;

const UPLOADS_ROOT = path.resolve("uploads");

const Interaction = require("../models/interaction.model");
const { updateInterestsFromAction } = require("../services/interestService");

const getMedia = asyncErrorHandler(async (req, res, next) => {
  
  const pin = await Pin.findById(req.params.id);
  if (!pin) return next(new ApiError("Pin not found", 404));

  const ownerId = String(pin.owner || pin.publisher);
  const fileTypeDir = pin.media.type === "image" ? "images" : "videos";
  const filename = pin.media.filename;
  if (!filename) return next(new ApiError("Media filename missing", 500));

  const base = path.join(
    UPLOADS_ROOT,
    "users",
    ownerId,
    "pins",
    pin.privacy,
    fileTypeDir
  );
  const abs = path.join(base, filename);

  if (pin.privacy === "public") {
    
    return res.redirect(
      302,
      `/media/users/${ownerId}/pins/public/${fileTypeDir}/${filename}`
    );
  }

  
  if (!req.user) return next(new ApiError("Unauthorized", 401));
  if (String(req.user.id) !== ownerId && !req.user.isAdmin)
    return next(new ApiError("Forbidden", 403));



   await Interaction.create({
          user: userId,
          pin: pin._id,
          action: "VIEW",
          keywords: pin.keywords || [],
        });
        await updateInterestsFromAction(userId, pin, "VIEW");

  await fsp.access(abs, fs.constants.R_OK);
  if (pin.media?.mimetype) res.type(pin.media.mimetype);
  res.setHeader("Cache-Control", "private, no-store");
  return res.sendFile(path.resolve(abs));
});

const downloadMedia = asyncErrorHandler(async (req, res, next) => {
  const pin = await Pin.findById(req.params.id);
  const userId = req.user?.id;
  if (!userId) return next(new ApiError("Unauthorized", 401));
  if (!pin) return next(new ApiError("Pin not found", 404));

  
  if (pin.privacy !== "public") return next(new ApiError("Forbidden", 403));

  const ownerId = String(pin.owner || pin.publisher);
  const fileTypeDir = pin.media?.type === "image" ? "images" : "videos";
  const filename = pin.media?.filename;
  if (!filename) return next(new ApiError("Media filename missing", 500));

  const base = path.join(UPLOADS_ROOT, "users", ownerId, "pins", "public", fileTypeDir);
  const abs = path.join(base, filename);

  const baseResolved = path.resolve(base) + path.sep;
  const absResolved = path.resolve(abs);
  if (!absResolved.startsWith(baseResolved)) {
    return next(new ApiError("Bad path", 400));
  }

  try {
    await fsp.access(absResolved, fs.constants.R_OK);
  } catch {
    return next(new ApiError("File not found", 404));
  }

  if (pin.media?.mimetype) res.type(pin.media.mimetype);

  const downloadName =
    pin.media?.originalName && typeof pin.media.originalName === "string"
      ? pin.media.originalName
      : filename;

  
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

  
  let finalized = false;
  const finalize = async (ok) => {
    if (finalized) return;
    finalized = true;

    try {
      if (ok && typeof pin.downloadCount === "number") {
        
        await Pin.updateOne({ _id: pin._id }, { $inc: { downloadCount: 1 } });
      }

      
      if (ok) {
        await Interaction.create({
          user: userId,
          pin: pin._id,
          action: "DOWNLOAD",
          keywords: pin.keywords || [],
        });
        await updateInterestsFromAction(userId, pin, "DOWNLOAD");
      }
    } catch (err) {
      if (typeof logger?.warn === "function") {
        logger.warn("download finalize failed", { pinId: pin._id, userId, ok, err: String(err) });
      }
    }
  };

  res.on("finish", () => finalize(true)); 
  res.on("close", () => finalize(false)); 
  res.on("error", () => finalize(false));

  
  return res.download(absResolved, downloadName, (err) => {
    if (err) return next(new ApiError("Failed to send file", 500));
  });
});

module.exports = {
  getMedia,
  downloadMedia,
};
