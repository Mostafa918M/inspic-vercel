const { Interest, INTERACTION_WEIGHTS } = require("../models/interests.model");

const norm = s => s.trim().toLowerCase();

//لو مفيش اي تفاعل لحد 14 يوم فالاسكور هيقل للنص
const HALF_LIFE_DAYS = 14;
const DECAY_BASE = Math.log(2) / (HALF_LIFE_DAYS * 24 * 60 * 60 * 1000); 

function applyDecay(oldScore, lastAt, now = Date.now()) {
  if (!lastAt) return oldScore;
  const dt = now - new Date(lastAt).getTime();
  const factor = Math.exp(-DECAY_BASE * dt);
  return oldScore * factor;
}
//---------------------------------------------------------------------------


function levelFromScore(score) {
  if (score >= 50) return "high";
  if (score >= 20) return "medium";
  return "low";
}

async function updateInterestsFromAction(userId, pinDoc, action) {
    const weight = INTERACTION_WEIGHTS[action] || 0;
  if (!weight) return;

  const extractedKeywords =
    (Array.isArray(pinDoc?.keywords) ? pinDoc.keywords : []);

  if (!extractedKeywords.length) return;

  const now = new Date();

  const ops = extractedKeywords.map(async (kw) => {
    const nk = norm(kw);
    const doc = await Interest.findOne({ user: userId, normKey: nk });

    if (!doc) {
      const baseScore = weight;
      return Interest.create({
        user: userId,
        keyword: kw,
        normKey: nk,
        score: baseScore,
        level: levelFromScore(baseScore),
        lastInteractionAt: now,
        lastScoreRecalcAt: now,
        counts: {
          views:     action === "VIEW" ? 1 : 0,
          clicks:    action === "CLICK" ? 1 : 0,
          likes:     action === "LIKE" ? 1 : 0,
          saves:     action === "SAVE" ? 1 : 0,
          comments:  action === "COMMENT" ? 1 : 0,
          downloads: action === "DOWNLOAD" ? 1 : 0,
          shares:    action === "SHARE" ? 1 : 0,
          searches:  action === "SEARCH" ? 1 : 0, // <-- new
        },
        topSources: [{
          pin: (action !== "SEARCH" ? pinDoc?._id : undefined),
          action, weight, at: now
        }]
      });
    }

    const decayed = applyDecay(doc.score, doc.lastInteractionAt, now);
    doc.score = decayed + weight;

    const fieldMap = {
      VIEW: "views",
      CLICK: "clicks",
      LIKE: "likes",
      SAVE: "saves",
      COMMENT: "comments",
      DOWNLOAD: "downloads",
      SHARE: "shares",
      SEARCH: "searches", // <-- new
    };
    const field = fieldMap[action];
    doc.counts[field] = (doc.counts[field] || 0) + 1;

    doc.topSources.unshift({
      pin: (action !== "SEARCH" ? pinDoc?._id : undefined),
      action, weight, at: now
    });
    if (doc.topSources.length > 5) doc.topSources.length = 5;

    doc.level = levelFromScore(doc.score);
    doc.lastInteractionAt = now;
    doc.lastScoreRecalcAt = now;

    return doc.save();
  });

  await Promise.all(ops);
}

module.exports = { updateInterestsFromAction, applyDecay, levelFromScore };