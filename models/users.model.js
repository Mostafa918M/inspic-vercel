const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    
    email: { type: String, required: true, unique: true },
    password: {
      type: String,
      required: function () {
        return this.provider === "local";
      },
      select: false,
    },
    avatar: { type: String, default: "https://www.gravatar.com/avatar/?d=mp" },
    birthdate: { type: Date, default: null },
    gender: { type: String, enum: ["male", "female"], default: null },

    
    bio: { type: String, default: "" },
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    following: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    boards: [{ type: mongoose.Schema.Types.ObjectId, ref: "Board" }],
    pins: [{ type: mongoose.Schema.Types.ObjectId, ref: "Pin" }],
    bookmarkedPins: [{ type: mongoose.Schema.Types.ObjectId, ref: "Pin" }],
    likedPins: [{ type: mongoose.Schema.Types.ObjectId, ref: "Pin" }],
    notifications: [{ type: mongoose.Schema.Types.ObjectId, ref: "Notification" }],
    savedSearches: [{ type: String, default: [] }],

     role: { type: String, enum: ["user", "admin"], default: "user" },
    googleId: { type: String, index: true },
    provider: { type: String, enum: ["local", "google"], default: "local" },
    isEmailVerified: { type: Boolean, default: false },

    emailVerificationCodeHash: { type: String, default: null },
    emailVerificationExpiresAt: { type: Date, default: null },
    emailVerificationAttempts: { type: Number, default: 0 },
    emailVerificationLastSentAt: { type: Date, default: null },

    passwordResetTokenHash: { type: String, default: null, select: false },
    passwordResetExpiresAt: { type: Date, default: null },
    passwordResetLastSentAt: { type: Date, default: null },
    tokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true }
);
module.exports = mongoose.model("User", userSchema);
