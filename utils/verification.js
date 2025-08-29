const bcrypt = require("bcrypt");
const crypto = require("crypto");

function generate6DigitCode() {
  
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

async function hashCode(code) {
  return bcrypt.hash(code, 10);
}

async function compareCode(code, hash) {
  return bcrypt.compare(code, hash);
}

module.exports = { generate6DigitCode, hashCode, compareCode };