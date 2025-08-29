const mongoose = require("mongoose");

const interactionSchema = new mongoose.Schema({
  user:  { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  pin:   { type: mongoose.Schema.Types.ObjectId, ref: "Pin", index: true },
  action:{ type: String, enum: ["VIEW","CLICK","LIKE","SAVE","COMMENT","DOWNLOAD","SHARE","SEARCH"], required: true, index: true },
  at:    { type: Date, default: Date.now, index: true },
  keywords: { type: [String], default: [] }
}, { timestamps: true });

interactionSchema.index({ user: 1, at: -1 });
module.exports = mongoose.model("Interaction", interactionSchema);