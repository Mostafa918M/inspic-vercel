//modules
const aqp = require("api-query-params");
const path = require("path");
const fs = require("fs");
const fsp = fs.promises;
//utils
const asyncErrorHandler = require("../utils/asyncErrorHandler");
const ApiError = require("../utils/ApiError");
const logger = require("../utils/logger");
const sendResponse = require("../utils/sendResponse");
const {
  ensureDir,
  userBucketDir,
  bucketFor,
  moveIfNeeded,
  buildMediaUri,
  toPosix,
} = require("../utils/mediaUtils");
const { generateKeywords } = require("../utils/keywords");
const { fetchPageMeta } = require("../utils/fetchPageMeta");
//models
const Pin = require("../models/pin.model");
const User = require("../models/users.model");
const Interaction = require("../models/interaction.model");
const Board = require("../models/board.model");
const Comment = require("../models/comments.model");
//services
const { updateInterestsFromAction } = require("../services/interestService");
const { recommendPinsForUser } = require("../services/recommendationService");
const { log } = require("console");
const { console } = require("inspector");
const { extractContentFromImage } = require("../utils/readImage");

const norm = (s) => s.trim().toLowerCase();
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const allowedImage = ["image/jpeg", "image/png"];
const allowedVideo = ["video/mp4", "video/mpeg", "video/quicktime"];
const isAllowed = (mt) =>
  allowedImage.includes(mt) || allowedVideo.includes(mt);

// ---------- controller ----------
const createPin = asyncErrorHandler(async (req, res, next) => {
  const { title, description, link, keywords, privacy, boards } = req.body;
  if (!title || !description) {
    return next(new ApiError("Title and description are required", 400));
  }
  if (!req.file) return next(new ApiError("Media file is required", 400));
  if (req.file.size > (req.file.sizeLimit || Infinity)) {
    return next(new ApiError("File exceeds allowed size", 400));
  }
  if (!isAllowed(req.file.mimetype)) {
    try {
      if (req.file.path) await fsp.unlink(req.file.path);
    } catch {}
    return next(new ApiError("Unsupported file type", 415));
  }

  const userId = req.user.id;
  const visibility = privacy ?? "public";
  const { vis, type } = bucketFor(visibility, req.file.mimetype);

  const finalDirAbs = path.resolve(userBucketDir(userId, vis, type));
  const safeFilename = path.basename(req.file.filename);
  const fromAbs = path.resolve(req.file.path);
  const storedAbs = await moveIfNeeded(fromAbs, finalDirAbs, safeFilename);

  const uri = buildMediaUri({
    userId,
    vis,
    type,
    filename: safeFilename,
  });
  const provided = Array.isArray(keywords)
    ? keywords
    : keywords
    ? [keywords]
    : [];

  let linkMeta = null;
  if (link) {
    linkMeta = await fetchPageMeta(link);
  }

  let extractedImage = null;
  if (req.file.mimetype && req.file.mimetype.startsWith("image/")) {
    extractedImage = await extractContentFromImage(storedAbs);
  }
  finalKeywords = await generateKeywords(
    title,
    description,
    provided,
    linkMeta,
    extractedImage
  );

  const pin = new Pin({
    publisher: userId,
    title,
    description,
    privacy: vis,
    media: {
      uri,
      URL: "",
      filename: safeFilename,
      type: req.file.mimetype.startsWith("image/") ? "image" : "video",
      thumbnail: null,
    },
    link: link || null,
    keywords: finalKeywords,
  });
  pin.media.URL = `/api/v1/pins/get-pin/${pin._id}/media`;
  await pin.save();

  await User.findByIdAndUpdate(userId, { $push: { pins: pin._id } });
  logger.info("Pin: pin Created Successfully", { pinId: pin._id, userId });

  return sendResponse(res, 201, "success", "Pin created", { pin });
});
const getPins = asyncErrorHandler(async (req, res, next) => {
  const userId = String(req.user.id);

  const {
    filter,
    sort,
    skip = 0,
    limit = 20,
    projection,
  } = aqp(req.query, {
    sort: {
      whitelist: [
        "createdAt",
        "updatedAt",
        "downloadCount",
        "pinReportCount",
        "title",
      ],
    },
  });

  const scope = String(req.query.scope || "public").toLowerCase();
  const mongoFilter = { ...filter };

  if (scope === "mine") {
    mongoFilter.publisher = userId;
  } else if (scope === "public") {
    mongoFilter.privacy = "public";
    if (req.query.excludeMe === "1") {
      mongoFilter.publisher = { $ne: userId };
    }
  }

  if (mongoFilter["media.type"]) {
    const t = String(mongoFilter["media.type"]).toLowerCase().trim();
    if (["image", "images", "img", "photo", "photos"].includes(t)) {
      mongoFilter["media.type"] = "image";
    }
    if (["video", "videos"].includes(t)) {
      mongoFilter["media.type"] = "video";
    }
  }

  function parseKwTokens(input) {
    if (!input) return [];
    const raw = input.match(/"[^"]+"|'[^']+'|[^,\s]+/g) || [];

    const tokens = [];
    for (const piece of raw) {
      const isQuoted = /^".*"$|^'.*'$/.test(piece);
      const unq = piece.replace(/^['"]|['"]$/g, "").trim();
      if (!unq) continue;

      if (isQuoted) {
        tokens.push(unq);
      } else if (/\s/.test(unq)) {
        tokens.push(...unq.split(/\s+/).filter(Boolean));
      } else {
        tokens.push(unq);
      }
    }
    return Array.from(new Set(tokens));
  }

  const kwRaw = (req.query.kw || req.query.keywords || "").toString();
  let kwTerms = parseKwTokens(kwRaw);

  if (kwTerms.length) {
    const regexes = kwTerms.map((k) => new RegExp(`\\b${escapeRegex(k)}\\b`, "i"));
    const mode = String(req.query.kwMode || "any").toLowerCase();
    mongoFilter.keywords = mode === "all" ? { $all: regexes } : { $in: regexes };
  }

  const qRaw = (req.query.q || "").toString();
  let qTokens = [];
  if (qRaw) {
    mongoFilter.$text = {
      $search: qRaw,
      $caseSensitive: false,
      $diacriticSensitive: false,
    };
    qTokens = qRaw
      .replace(/["']/g, " ")
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  let cursor = Pin.find(mongoFilter);
  if (projection) cursor = cursor.select(projection);

  if (mongoFilter.$text) {
    cursor = cursor
      .select({ score: { $meta: "textScore" }, ...(projection || {}) })
      .sort({ score: { $meta: "textScore" } });
  } else if (sort) {
    cursor = cursor.sort(sort);
  }

  const hardLimit = Math.min(100, Math.max(1, +limit || 20));
  cursor = cursor.skip(+skip || 0).limit(hardLimit);

  const [pins, total] = await Promise.all([
    cursor.lean(),
    Pin.countDocuments(mongoFilter),
  ]);

  const normalized = pins.map((p) => {
    const { keywords, ...rest } = p;
    return {
      ...rest,
      media: {
        ...p.media,
        URL: p.media?.URL || `/api/v1/pins/get-pin/${p._id}/media`,
      },
    };
  });

  const allTerms = Array.from(new Set([...kwTerms, ...qTokens]));
  if (userId && allTerms.length) {
    Interaction.create({
      user: userId,
      action: "SEARCH",
      keywords: allTerms,
    }).catch(() => {});
    updateInterestsFromAction(userId, { keywords: allTerms }, "SEARCH").catch(
      () => {}
    );

    User.findByIdAndUpdate(userId, {
      $addToSet: { savedSearches: { $each: allTerms } },
    }).catch(() => {});
  }

  return sendResponse(res, 200, "success", "Pins fetched", {
    pins: normalized,
    total,
    limit: hardLimit,
    skip: +skip || 0,
    query: {
      scope,
      kw: kwRaw || undefined,
      q: qRaw || undefined,
      terms: allTerms,
    },
  });
});


const getPinById = asyncErrorHandler(async (req, res, next) => {
  const userId = req.user.id;
  if (!userId) return next(new ApiError("Unauthorized", 401));
  const pinId = req.params.id;
  if (!pinId) return next(new ApiError("Pin ID is required", 400));
  const pin = await Pin.findById(pinId).populate({ path: "publisher", select: "username avatar" })
  .lean();
  if (!pin) return next(new ApiError("Pin not found", 404));
  if ( pin.privacy === "private" &&String(pin.publisher) !== String(req.user.id) ) {
    return next(new ApiError("Forbidden", 403));
  }
  pin.likeCount = Array.isArray(pin.likers)?pin.likers.length:0;
  await Interaction.create({
    user: userId,
    pin: pin._id,
    action: "VIEW",
    keywords: pin.keywords || [],
  });
  await updateInterestsFromAction(userId, pin, "VIEW");
  pin.keywords = [];
  return sendResponse(res, 200, "success", "Pin fetched", { pin });
});
const updatePin = asyncErrorHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { title, description, link, keywords, privacy, boards } = req.body;

  const pin = await Pin.findById(req.params.id);
  if (!pin) return next(new ApiError("Pin not found", 404));

  if (String(pin.publisher) !== String(userId)) {
    return next(new ApiError("Forbidden", 403));
  }

  const updates = {};
  if (typeof title === "string") updates.title = title;
  if (typeof description === "string") updates.description = description;
  if (typeof link === "string") updates.link = link;

  const newTitle = (typeof title === "string" ? title : pin.title) ?? "";
  const newDesc =
    (typeof description === "string" ? description : pin.description) ?? "";
  const newLink = (typeof link === "string" ? link : pin.link) || null;

  const providedKeywords = Array.isArray(keywords)
    ? keywords
    : typeof keywords === "string" && keywords.trim()
    ? [keywords]
    : [];

  let linkMeta = null;
  if (typeof newLink === "string" && newLink.trim()) {
    try {
      new URL(newLink);
      linkMeta = await fetchPageMeta(newLink);
    } catch {
      linkMeta = null;
    }
  }

  const type = pin.media?.type === "image" ? "images" : "videos";
  const filename =
    pin.media?.filename ||
    (pin.media?.path ? path.basename(pin.media.path) : null) ||
    (pin.media?.uri ? path.basename(pin.media.uri) : null);

  let currentAbs = null;
  if (filename) {
    const currentDir = pin.media?.path
      ? path.dirname(path.resolve(pin.media.path))
      : path.resolve(userBucketDir(userId, pin.privacy || "public", type));
    currentAbs = path.resolve(currentDir, filename);
  }

  let extractedImage = null;
  if (pin.media?.type === "image" && currentAbs) {
    try {
      extractedImage = await extractContentFromImage(currentAbs);
    } catch {
      extractedImage = null;
    }
  }

  const finalKeywords = await generateKeywords(
    newTitle,
    newDesc,
    [...providedKeywords],
    linkMeta,
    extractedImage
  );

  updates.keywords = finalKeywords;

  if (typeof privacy !== "undefined" && privacy !== null) {
    const newVisRaw =
      String(privacy).toLowerCase() === "private" ? "private" : "public";
    const newVis = newVisRaw === "private" ? "private" : "public";

    if (newVis !== pin.privacy) {
      if (!filename) {
        return next(new ApiError("Existing media filename is missing", 500));
      }

      const newDir = userBucketDir(userId, newVis, type);
      const fromAbs = pin.media?.path
        ? path.resolve(pin.media.path)
        : path.resolve(
            userBucketDir(userId, pin.privacy || "public", type),
            filename
          );

      const newAbs = await moveIfNeeded(
        fromAbs,
        path.resolve(newDir),
        filename
      );

      updates.privacy = newVis;
      updates["media.path"] = toPosix(newAbs);
      updates["media.uri"] = buildMediaUri({
        userId,
        vis: newVis,
        type,
        filename,
      });
      updates["media.filename"] = filename;
    }
  }

  Object.assign(pin, updates);
  await pin.save();

  return sendResponse(res, 200, "success", "Pin updated", { pin });
});
const deletePin = asyncErrorHandler(async (req, res, next) => {
  const userId = req.user.id;
  const pinId = req.params.id;
  if (!userId) return next(new ApiError("Unauthorized", 401));

  const pin = await Pin.findById(pinId);
  if (!pin) return next(new ApiError("Pin not found", 404));

  if (String(pin.publisher) !== String(req.user.id)) {
    return next(new ApiError("Forbidden", 403));
  }

  const typeDir = pin.media?.type === "image" ? "images" : "videos";
  const filename = pin.media?.filename;
  if (!filename) return next(new ApiError("Media filename missing", 500));

  const candidates = [
    path.resolve(userBucketDir(pin.publisher, "public", typeDir), filename),
    path.resolve(userBucketDir(pin.publisher, "private", typeDir), filename),
  ];

  for (const p of candidates) {
    try {
      await fsp.unlink(p);
    } catch (e) {
      if (e?.code !== "ENOENT") logger?.error?.(e);
    }
  }

  await Promise.all([
    Pin.deleteOne({ _id: pin._id }),
    User.findByIdAndUpdate(pin.publisher, { $pull: { pins: pin._id } }),
  ]);
  logger.info("Pin: Pin deleted successfully", { pinId, userId });
  return sendResponse(res, 200, "success", "Pin deleted", { id: pin._id });
});

const   likedPins = asyncErrorHandler(async (req, res, next) => {
  const userId = req.user.id;
  const pin = await Pin.findById(req.params.id);

  if (!pin) return next(new ApiError("Pin not found", 404));
  if (String(pin.publisher) === String(userId)) {
    return next(new ApiError("You cannot like your own pin", 403));
  }
  if (pin.likers.includes(userId)) {
    return next(new ApiError("You have already liked this pin", 400));
  }

  const already = (pin.likers || []).some(id => id.equals(uid));
if (already) return next(new ApiError("You have already liked this pin", 400));


  pin.likers.push(userId);
  await pin.save();

  await User.findByIdAndUpdate(userId, { $push: { likedPins: pin._id } });

  await Interaction.create({
    user: userId,
    pin: pin._id,
    action: "LIKE",
    keywords: pin.keywords || [],
  });
  logger.info("Pin: Pin liked successfully", { pinId: pin._id, userId });
  await updateInterestsFromAction(userId, pin, "LIKE");
  sendResponse(res, 200, "success", "Pin liked", { pinId: pin._id, liked:true,likeCount:(pin.likers||[]).length });
});

const unlikePin = asyncErrorHandler(async (req, res, next) => {
  const userId = req.user.id;
  const pin = await Pin.findById(req.params.id);

  if (!pin) return next(new ApiError("Pin not found", 404));
  if (String(pin.publisher) === String(userId)) {
    return next(new ApiError("You cannot unlike your own pin", 403));
  }
  if (!pin.likers.includes(userId)) {
    return next(new ApiError("You have not liked this pin", 400));
  }
  const had = (pin.likers || []).some(id => id.equals(uid));
if (!had) return next(new ApiError("You have not liked this pin", 400));


  pin.likers.pull(userId);
  await pin.save();

  await User.findByIdAndUpdate(userId, { $pull: { likedPins: pin._id } });

  logger.info("Pin: Pin unliked successfully", { pinId: pin._id, userId });
  sendResponse(res, 200, "success", "Pin unliked", { pinId: pin._id, liked: false, likeCount: (pin.likers || []).length });
});

const addComment = asyncErrorHandler(async (req, res, next) => {
  const userId = req.user.id;
  if (!userId) return next(new ApiError("Unauthorized", 401));
  const pinId = req.params.id;
  const { text } = req.body;
  if (!text) return next(new ApiError("Comment text is required", 400));

  const pin = await Pin.findById(pinId);
  if (!pin) return next(new ApiError("Pin not found", 404));

  const comment = await Comment.create({
    user: userId,
    pin: pinId,
    text,
  });

  pin.comments.push(comment._id);
  await pin.save();

  await Interaction.create({
    user: userId,
    pin: pin._id,
    action: "COMMENT",
    keywords: pin.keywords || [],
  });
  await updateInterestsFromAction(userId, pin, "COMMENT");
  logger.info("Pin: Comment created successfully", { pinId, userId });
  sendResponse(res, 201, "success", "Comment created", { comment });
});
const getComments = asyncErrorHandler(async (req, res, next) => {
  const pinId = req.params.id;
  const pin = await Pin.findById(pinId).populate({
    path: "comments",
    populate: { path: "user", select: "username avatar" },
  });
  if (!pin) return next(new ApiError("Pin not found", 404));
  sendResponse(res, 200, "success", "Comments fetched", {
    comments: pin.comments,
  });
});
const addReplay = asyncErrorHandler(async (req, res, next) => {
  const userId = req.user.id;
  if (!userId) return next(new ApiError("Unauthorized", 401));
  const commentId = req.params.commentId;
  const { text } = req.body;
  if (!text) return next(new ApiError("Replay text is required", 400));

  const parentComment = await Comment.findById(commentId);
  if (!parentComment) return next(new ApiError("Comment not found", 404));
  const reply = await Comment.create({
    user: userId,
    pin: parentComment.pin,
    text,
    parent: commentId,
  });
  parentComment.replies.push(reply._id);

  await parentComment.save();

  await Interaction.create({
    user: userId,
    pin: parentComment.pin,
    action: "COMMENT",
    keywords: [],
  });
  await updateInterestsFromAction(userId, parentComment.pin, "COMMENT");
  logger.info("Pin: Replay created successfully", { commentId, userId });
  sendResponse(res, 201, "success", "Reply created", { reply });
});
const deleteComment = asyncErrorHandler(async (req, res, next) => {
  const userId = req.user.id;
  if (!userId) return next(new ApiError("Unauthorized", 401));

  const { commentId } = req.params;

  const comment = await Comment.findById(commentId).lean();
  if (!comment) return next(new ApiError("Comment not found", 404));

  const isOwner = String(comment.user) === String(userId);
  const isAdmin = Boolean(req.user?.isAdmin);
  if (!isOwner && !isAdmin) return next(new ApiError("Forbidden", 403));

  const queue = [commentId];
  const toDelete = [];
  while (queue.length) {
    const id = queue.shift();
    toDelete.push(id);
    const c = await Comment.findById(id, "replies").lean();
    if (c?.replies?.length) queue.push(...c.replies.map((r) => String(r)));
  }

  if (comment.parent) {
    await Comment.findByIdAndUpdate(
      comment.parent,
      { $pull: { replies: { $in: toDelete } } },
      { new: false }
    );
  } else {
    await Pin.findByIdAndUpdate(
      comment.pin,
      { $pull: { comments: { $in: toDelete } } },
      { new: false }
    );
  }

  await Comment.deleteMany({ _id: { $in: toDelete } });

  await Interaction.deleteMany({
    pin: comment.pin,
    comment: { $in: toDelete },
  });

  await updateInterestsFromAction(userId, comment.pin, "COMMENT");

  logger.info("Pin: Comment deleted successfully", {
    commentId,
    userId,
    count: toDelete.length,
  });
  sendResponse(res, 200, "success", "Comment deleted", { ids: toDelete });
});

const getRecommendedPins = asyncErrorHandler(async (req, res, next) => {
 const userId = req.user.id;
  const limit = Math.min(Math.max(parseInt(req.query.limit || "30", 10), 1), 100);

  let pins = await recommendPinsForUser(userId, { limit });

  pins = await Pin.populate(pins, [
    { path: "publisher", select: "username avatar" },
    { path: "board", select: "name" },
  ]);

  pins = pins.map((p) => ({
    ...p,
    likeCount: Array.isArray(p.likers) ? p.likers.length : 0,
    commentCount: Array.isArray(p.comments) ? p.comments.length : 0,
  }));

  return sendResponse(res, 200, "success", "Recommended pins fetched", { pins });
});

const reportPin = asyncErrorHandler(async (req, res, next) => {
  const userId = req.user.id;
  const pinId = req.params.id;
  if (!userId) return next(new ApiError("Unauthorized", 401));

  const pin = await Pin.findById(pinId);
  if (!pin) return next(new ApiError("Pin not found", 404));

  if (pin.publisher === userId) {
    return next(new ApiError("You cannot report your own pin", 403));
  }

  pin.pinReportCount = (pin.pinReportCount || 0) + 1;
  await pin.save();

  logger.info("Pin: Pin reported successfully", { pinId, userId });
  sendResponse(res, 200, "success", "Pin reported", { pin });
});
const addBookmark = asyncErrorHandler(async (req, res, next) => {
  const userId = req.user.id;
  const pinId = req.params.id;
  if (!userId) return next(new ApiError("Unauthorized", 401));
  const pin = await Pin.findById(pinId);
  if (!pin) return next(new ApiError("Pin not found", 404));
  if (pin.bookmarkedBy.includes(userId)) {
    return next(new ApiError("You have already bookmarked this pin", 400));
  }
  pin.bookmarkedBy.push(userId);
  await pin.save();

  await User.findByIdAndUpdate(userId, {
    $addToSet: { bookmarkedPins: pin._id },
  });

  logger.info("Pin: Pin bookmarked successfully", { pinId, userId });
  await Interaction.create({
    user: userId,
    pin: pin._id,
    action: "SAVE",
    keywords: pin.keywords || [],
  });
  await updateInterestsFromAction(userId, pin, "SAVE");
  const updatedPin = await Pin.findById(pin._id).select(
    "title description media bookmarkedBy"
  );
  sendResponse(res, 200, "success", "Pin bookmarked", { updatedPin });
});
const removeBookmark = asyncErrorHandler(async (req, res, next) => {
  const userId = req.user?.id;
  const pinId = req.params?.id;

  if (!userId) return next(new ApiError("Unauthorized", 401));

  const pin = await Pin.findById(pinId);
  if (!pin) return next(new ApiError("Pin not found", 404));

  const pinUpdate = await Pin.updateOne(
    { _id: pin._id },
    { $pull: { bookmarkedBy: userId } }
  );

  if (pinUpdate.modifiedCount === 0) {
    return next(new ApiError("You have not bookmarked this pin", 400));
  }

  await User.updateOne({ _id: userId }, { $pull: { bookmarkedPins: pin._id } });

  logger.info("Pin: Pin bookmark removed successfully", {
    pinId: pin._id.toString(),
    userId,
  });

  const updatedPin = await Pin.findById(pin._id).select(
    "title description media bookmarkedBy"
  );

  sendResponse(res, 200, "success", "Pin bookmark removed", {
    pin: updatedPin,
  });
});
const getBookmarkedPins = asyncErrorHandler(async (req, res, next) => {
  const userId = req.user.id;
  if (!userId) return next(new ApiError("Unauthorized", 401));
  const user = await User.findById(userId).populate({
    path: "bookmarkedPins",
    select: "title description media",
  });

  if (!user) return next(new ApiError("User not found", 404));

  sendResponse(res, 200, "success", "Bookmarked pins fetched", {
    pins: user.bookmarkedPins,
  });
});
const getPopularPins = asyncErrorHandler(async (req, res, next) => {
  const limit = Math.min(
    Math.max(parseInt(req.query.limit || "30", 10), 1),
    100
  );
  const time = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const pins = await Pin.find({ privacy: "public", createdAt: { $gte: time } })
    .select("title description media likeCount commentCount publisher")
    .sort({ likeCount: -1, commentCount: -1, createdAt: -1 })
    .limit(limit)
    .populate({ path: "publisher", select: "username avatar" });

  if (!pins.length) {
    return sendResponse(res, 200, "success", "No popular pins found", {
      pins: [],
    });
  }

  return sendResponse(res, 200, "success", "Popular pins fetched", { pins });
});

module.exports = {
  createPin,
  getPins,
  getPinById,
  updatePin,
  deletePin,
  likedPins,
  unlikePin,
  addComment,
  getComments,
  addReplay,
  deleteComment,
  getRecommendedPins,
  reportPin,
  addBookmark,
  removeBookmark,
  getBookmarkedPins,
  getPopularPins
};
