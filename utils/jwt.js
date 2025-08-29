const jwt = require("jsonwebtoken");
const logger = require("./logger");
const ApiError = require("../utils/ApiError");

const JWT_SECRET_REFRESH = process.env.JWT_SECRET_REFRESH;
const JWT_SECRET_ACCESS = process.env.JWT_SECRET_ACCESS;

function signToken(payload, secret, expiresIn) {
  try {
    return jwt.sign(payload, secret, {
      expiresIn
    });
  } catch (err) {
    logger.error("JWT signing failed", {
      message: err.message,
      stack: err.stack,
    });
    throw new ApiError("Token generation failed", 500);
  }
}

const generateRefreshToken = (user) => {
    const payload = { id: user._id, role: user.role, tokenVersion: user.tokenVersion, type: "refresh" };
  return signToken(payload, JWT_SECRET_REFRESH, "7d");
};

const generateAccessToken = (user) => {
  const payload = { id: user._id, role: user.role, tokenVersion: user.tokenVersion, type: "access" };
  return signToken(payload, JWT_SECRET_ACCESS, "15m");
};

module.exports = {
  generateRefreshToken,
  generateAccessToken,
};
