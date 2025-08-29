const mongoose = require("mongoose");


const INTERACTION_WEIGHTS = {
  VIEW: 1,         
  CLICK: 2,        
  LIKE: 4,
  SAVE: 6,        
  COMMENT: 5,
  DOWNLOAD: 3,
  SHARE: 5,
  SEARCH:3
}
const interestSchema = new mongoose.Schema({
   user: {type: mongoose.Schema.Types.ObjectId, ref: "User", index: true, required: true},
   level: {type: Number, default: 0, min: 0, max: 100},
   keyword:   { type: String, required: true },
  normKey:   { type: String, required: true, index: true },
   score:     { type: Number, default: 0, index: true },

   counts: {
    views:     { type: Number, default: 0 },
    clicks:    { type: Number, default: 0 },
    likes:     { type: Number, default: 0 },
    saves:     { type: Number, default: 0 },
    comments:  { type: Number, default: 0 },
    downloads: { type: Number, default: 0 },
    shares:    { type: Number, default: 0 },
    searches:  { type: Number, default: 0 }
  },

  level: { type: String, enum: ["low", "medium", "high"], default: "low", index: true },

    lastInteractionAt: { type: Date, default: null, index: true },
  lastScoreRecalcAt: { type: Date, default: null },

   topSources: [{
    pin:      { type: mongoose.Schema.Types.ObjectId, ref: "Pin" },
    action:   { type: String, enum: Object.keys(INTERACTION_WEIGHTS) },
    weight:   { type: Number },
    at:       { type: Date, default: Date.now }
  }],
},{ timestamps: true });

interestSchema.index({ user: 1, normKey: 1 }, { unique: true });

module.exports = {Interest: mongoose.model("Interest", interestSchema), INTERACTION_WEIGHTS };