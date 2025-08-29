const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

function userBucketDir(userId, vis, type) {
  return path.join("uploads", "users", String(userId), "pins", vis, type);
}

function bucketFor(visibility, mimetype) {
  const visKey = (visibility || "").toString().toLowerCase();
  const vis = visKey === "private" ? "private" : "public"; 
  const type = mimetype?.startsWith("image/") ? "images" : "videos";
  return { vis, type };
}

async function moveIfNeeded(fromAbsPath, toDirAbs, filename) {
  ensureDir(toDirAbs);
  const toAbs = path.join(toDirAbs, filename);
  if (path.resolve(fromAbsPath) !== path.resolve(toAbs)) {
    await fsp.rename(fromAbsPath, toAbs);
  }
  return toAbs;
}
function toPosix(p) { return p.split(path.sep).join("/"); }

function buildMediaUri({ userId, vis, type, filename }) {    

  return toPosix(`/media/users/${userId}/pins/${vis}/${type}/${filename}`);
}   

module.exports = {
  ensureDir,
  userBucketDir,
  bucketFor,
  moveIfNeeded,
  toPosix,
  buildMediaUri,
};