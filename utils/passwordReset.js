const crypto = require('crypto');

function generatePasswordResetToken() {
  const token = crypto.randomBytes(32).toString("hex"); 
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  return { token, hash };
}

function hashPasswordResetToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

module.exports = {
  generatePasswordResetToken,
  hashPasswordResetToken,
};