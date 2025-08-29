// middleware/auth.js
const jwt = require("jsonwebtoken");
const User = require("../models/users.model");
const JWT_SECRET_ACCESS = process.env.JWT_SECRET_ACCESS;
const ApiError = require("../utils/ApiError");
const sendResponse = require("../utils/sendResponse");

function authMiddleware(allowedUsers = ["user"]) {
  return async function (req, res, next) {
    const token = req.cookies.accessToken;
    if (!token) {
      return next(new ApiError("No token provided, please login", 401));
    }
    

    try {
      const decoded = jwt.verify(token, JWT_SECRET_ACCESS);
    
      const user = await User.findById(decoded.id).select("role tokenVersion isEmailVerified");
      if (!user) {
        return next(new ApiError("Invalid or expired token, please login again", 401));
      }

      if(user.isEmailVerified === false) {
        return next(new ApiError("Email not verified, please verify your email", 403));
      }

      if ((user.tokenVersion || 0) !== (decoded.tokenVersion || 0)) {
        
        return next(new ApiError("Token revoked. Please login again.", 401));
      }

      req.user = { ...decoded, role: user.role, isEmailVerified: user.isEmailVerified };
      if (allowedUsers && !allowedUsers.includes(user.role)) {
        return sendResponse(res, 403, "fail", "Access denied: You do not have permission");
      }

      next();
    } catch (err) {
      return next(new ApiError("Invalid or expired token, please login again", 401));
    }
  };
}

module.exports = authMiddleware;
