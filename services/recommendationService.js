// services/recommendationService.js
const { Interest } = require("../models/interests.model");
const Pin = require("../models/pin.model");
const mongoose = require("mongoose");
const User = require('../models/users.model');

async function recommendPinsForUser(userId, { limit = 30 } = {}) {
  const uid = new mongoose.Types.ObjectId(userId);

  const top = await Interest.find({ user: uid })
    .sort({ score: -1 })
    .limit(50)
    .select("normKey score")
    .lean();

  const interestKeys = top.map(t => t.normKey);

  const user = await User.findById(uid).select("savedSearches").lean();
  const savedKeys = (user?.savedSearches || []).filter(Boolean).map(k => k.trim().toLowerCase());

  const keys = Array.from(new Set([...interestKeys, ...savedKeys]));

  if (!keys.length) {
    return [];
  }

  const pipeline = [
    { $match: { privacy: "public", publisher: { $ne: uid }, keywords: { $exists: true, $ne: [] } } },
    { $match: { keywords: { $in: keys } } },
    {
      $lookup: {
        from: "interests",
        let: { pinKeywords: "$keywords" },
        pipeline: [
          { $match: { $expr: { $and: [
              { $eq: ["$user", uid] },
              { $in: ["$normKey", "$$pinKeywords"] }
          ]}}},
          { $project: { score: 1 } }
        ],
        as: "interestMatches"
      }
    },
    { $addFields: { interestScore: { $sum: "$interestMatches.score" } } },
    { $match: { interestScore: { $gt: 0 } } }, 
    { $sort: { interestScore: -1, createdAt: -1 } },
    { $limit: limit },
    { $project: { keywords: 0, interestMatches: 0 } },
  ];

  return Pin.aggregate(pipeline).exec();
}

module.exports = { recommendPinsForUser };
