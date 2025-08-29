const asyncErrorHandler = require("../utils/asyncErrorHandler");
const ApiError = require("../utils/ApiError");
const User = require("../models/users.model");
const bcrypt = require("bcrypt");
const passwordValidator = require('../utils/passwordValidator');
const { generateRefreshToken, generateAccessToken } = require("../utils/jwt");
const sendResponse = require("../utils/sendResponse");
const logger = require("../utils/logger");
const jwt = require("jsonwebtoken");

const { generate6DigitCode, hashCode, compareCode } = require("../utils/verification");
const { sendVerificationEmail, sendPasswordResetEmail } = require("../utils/mailer");

const { OAuth2Client } = require("google-auth-library");
const { generatePasswordResetToken, hashPasswordResetToken } = require("../utils/passwordReset");

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);


const APP_URL = process.env.APP_URL || "http://localhost:3000";
const FRONTEND_URL = process.env.FRONTEND_URL
const VERIFICATION_CODE_TTL_MIN = 15
const MAX_VERIFICATION_ATTEMPTS = 5
const RESEND_COOLDOWN_SECONDS = 60

const RESET_TOKEN_TTL_MIN = process.env.RESET_TOKEN_TTL_MIN || 30
const RESET_RESEND_COOLDOWN_SECONDS = process.env.RESET_RESEND_COOLDOWN_SECONDS || 60

async function createAndSendEmailCode(user, logger) {
  const code = generate6DigitCode();
  user.emailVerificationCodeHash = await hashCode(code);
  user.emailVerificationExpiresAt = new Date(Date.now() + VERIFICATION_CODE_TTL_MIN * 60 * 1000);
  user.emailVerificationAttempts = 0;
  user.emailVerificationLastSentAt = new Date();
  await user.save();

  await sendVerificationEmail(user.email, code);
  logger.info("Auth: verification code sent", { userId: user._id.toString(), email: user.email });
}

const signup = asyncErrorHandler(async (req, res, next) => {
  const { username, firstName, lastName, email, password } = req.body;
  logger.info("Auth: signup attempt", {
    email,
    ip: req.ip,
    ua: req.headers["user-agent"],
  });
  if (!username || !email || !password || !firstName || !lastName) {
    logger.warn("Auth: signup missing fields");
    return next(new ApiError("Please provide all required fields"));
  }
  const {valid,errors} = passwordValidator.validatePasswordUsingLib(password, { username, email });
  if (!valid) {
    logger.warn("Auth: signup invalid password", { email, errors });
    return next(new ApiError("Invalid password", 400));
  }
  const existingEmail = await User.findOne({ email });
  if (existingEmail) {
    logger.warn("Auth: signup email already in use", { email });
    return next(new ApiError("email already in use"));
  }
  const hashPassword = await bcrypt.hash(password, 10);
  const user = new User({
    username: username,
    firstName: firstName,
    lastName: lastName,
    email: email,
    password: hashPassword,
    provider: "local",
    isEmailVerified: false
  });

  await user.save();
  await createAndSendEmailCode(user, logger);

 logger.info("Auth: signup created, awaiting email verification", {
    userId: user._id.toString(),
    email,
    ip: req.ip,
  });
  sendResponse(res,201,"success", "Signup successful. Please verify your email with the code sent.",{
    user: {
      id: user._id,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      isEmailVerified: user.isEmailVerified
    },
  })
});


const signin = asyncErrorHandler(async (req, res, next) => {
  const { email, password } = req.body;

  logger.info("Auth: signin attempt", {
    email,
    ip: req.ip,
    ua: req.headers["user-agent"],
  });

  if (!email || !password) {
    logger.warn("Auth: signin missing fields", { email, hasEmail: !!email, hasPassword: !!password });
    return next(new ApiError("Please provide all required fields", 400));
  }
  const user = await User.findOne({ email }).select("+password");
  if (!user) {
    logger.warn("Auth: signin invalid email", { email, reason: "user_not_found" });
    return next(new ApiError("Invalid email or password", 401));
  }
   if (!user.password) {
    return next(new ApiError("This account uses Google Sign-In. Use 'Continue with Google' or set a password.", 401));
  }
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    logger.warn("Auth: signin invalid password", { email });
    return next(new ApiError("Invalid email or password"));
  }

   if (!user.isEmailVerified) {
    
    const now = new Date();
    if (
      user.emailVerificationLastSentAt &&
      (now - new Date(user.emailVerificationLastSentAt)) / 1000 < RESEND_COOLDOWN_SECONDS
    ) {
      logger.info("Auth: verification code throttled", { email });
      return sendResponse(res, 202, "pending", "Email not verified. Check your inbox for the latest code.", {
        requiresEmailVerification: true,
      });
    }
  
     if (!user.emailVerificationExpiresAt || user.emailVerificationExpiresAt < now) {
      await createAndSendEmailCode(user, logger);
    } else {
      await createAndSendEmailCode(user, logger);
    }

    return sendResponse(res, 202, "pending", "Email not verified. A new verification code has been sent.", {
      requiresEmailVerification: true,
    });
  }

  const RefreshToken = generateRefreshToken(user);
  const accessToken = generateAccessToken(user);
  res.cookie("refreshToken", RefreshToken, {
    httpOnly: true,
    sameSite: "Strict",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
    res.cookie("accessToken", accessToken, {
    httpOnly: true,
    sameSite: "Strict",
    maxAge: 15 * 60 * 1000,
  });
    logger.info("Auth: signin success", {
    userId: user._id.toString(),
    email,
    ip: req.ip,
  });
   return sendResponse(res,200,"success", "Signin successful",{
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
    }
  })
  
});

const callback = asyncErrorHandler(async (req, res, next) => {
  const { idToken } = req.body;
  if (!idToken) return next(new ApiError("Missing Google token"));

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch (e) {
    return next(new ApiError("Invalid Google token"));
  }

  const { sub: googleId, email, name, picture, email_verified } = payload || {};
  if (!email || !googleId || !email_verified) return next(new ApiError("Unable to authenticate with Google"));

  // find by googleId or email (to auto-link)
  let user = await User.findOne({ $or: [{ googleId }, { email }] });

  if (!user) {
    user = await User.create({
      username: name || email.split("@")[0],
      firstName: name ? name.split(" ")[0] : "",
      lastName: name ? name.split(" ").slice(1).join(" ") : "",
      email,
      googleId,
      provider: "google",
      avatar: picture,
      isEmailVerified: true,
    });
  } else {
    const updates = {};
    if (!user.googleId) updates.googleId = googleId;
    if (user.provider !== "google") updates.provider = "google"; 
    if (!user.isEmailVerified && email_verified) updates.isEmailVerified = true;
    if (!user.avatar && picture) updates.avatar = picture;
    if (Object.keys(updates).length) await User.updateOne({ _id: user._id }, { $set: updates });
  }

  const RefreshToken = generateRefreshToken(user);
  const accessToken  = generateAccessToken(user);
  res.cookie("refreshToken", RefreshToken, {
    httpOnly: true,
    sameSite: "Strict",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  res.cookie("accessToken", accessToken, {
    httpOnly: true,
    sameSite: "Strict",
    maxAge: 15 * 60 * 1000,
  });

  sendResponse(res, 200, "success", "Signin successful", {
    user: {
      id: user._id, username: user.username, email: user.email, role: user.role,
      avatar: user.avatar, provider: user.provider,
    }
  });
});
const verifyEmail = asyncErrorHandler(async (req, res, next) => {
  const { email, code } = req.body;

  logger.info("Auth: verify email attempt", { email, ip: req.ip });

  if (!email || !code) {
    return next(new ApiError("Email and code are required"));
  }

  const user = await User.findOne({ email });
  if (!user) return next(new ApiError("Invalid code or email"));

  if (user.isEmailVerified) {
    return sendResponse(res, 200, "success", "Email already verified", {
      alreadyVerified: true,
    });
  }

  const now = new Date();
  if (!user.emailVerificationExpiresAt || user.emailVerificationExpiresAt < now) {
    return next(new ApiError("Verification code expired. Please request a new code."));
  }

  if (user.emailVerificationAttempts >= MAX_VERIFICATION_ATTEMPTS) {
    return next(new ApiError("Too many failed attempts. Please request a new code."));
  }

  const ok = await compareCode(code, user.emailVerificationCodeHash || "");
  user.emailVerificationAttempts += 1;

  if (!ok) {
    await user.save();
    logger.warn("Auth: verify email failed attempt", { email, attempts: user.emailVerificationAttempts });
    return next(new ApiError("Invalid verification code."));
  }

 
  user.isEmailVerified = true;
  user.emailVerificationCodeHash = null;
  user.emailVerificationExpiresAt = null;
  user.emailVerificationAttempts = 0;
  await user.save();

  const RefreshToken = generateRefreshToken(user);
  const accessToken = generateAccessToken(user);

  res.cookie("refreshToken", RefreshToken, {
    httpOnly: true,
    sameSite: "Strict",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.cookie("accessToken", accessToken, {
    httpOnly: true,
    sameSite: "Strict",
    maxAge: 15 * 60 * 1000,
  });

  logger.info("Auth: email verified", { userId: user._id, email });

  return sendResponse(res, 200, "success", "Email verified successfully", {
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
    }
  });
});

const resendVerification = asyncErrorHandler(async (req, res, next) => {
  const { email } = req.body;

  logger.info("Auth: resend verification attempt");

  if (!email) return next(new ApiError("Email is required"));

  const user = await User.findOne({ email });
  if (!user) {
    return sendResponse(res, 200, "success", "If this email exists, a new code was sent.");
  }

  if (user.isEmailVerified) {
    return sendResponse(res, 200, "success", "Email already verified.");
  }

  const now = new Date();
  if (
    user.emailVerificationLastSentAt &&
    (now - new Date(user.emailVerificationLastSentAt)) / 1000 < RESEND_COOLDOWN_SECONDS
  ) {
    return next(new ApiError("Please wait before requesting another code."));
  }

  await createAndSendEmailCode(user, logger);
  return sendResponse(res, 200, "success", "Verification code sent.");
});

const newAccessToken = asyncErrorHandler(async (req, res, next) => {
  const token = req.cookies.refreshToken
  if(!token) {
    return next(new ApiError("Missing refresh token", 401));
  }
  const decoded = jwt.verify(token, process.env.JWT_SECRET_REFRESH);
  if (!decoded) {
    return next(new ApiError("Invalid refresh token", 401));
  }

  const user = await User.findById(decoded.id);
  if (!user) {
    return next(new ApiError("User not found", 404));
  }

  const newAccessToken = generateAccessToken(user);

  res.cookie("accessToken", newAccessToken, {
    httpOnly: true,
    sameSite: "Strict",
    maxAge: 15 * 60 * 1000,
  });
  
  logger.info("Auth: new access token generated", {userId: user._id.toString(),});
  return sendResponse(res, 200, "success", "New access token generated");
});

const signout = asyncErrorHandler(async (req, res, next) => {
  logger.info("Auth: signout attempt");

 try {
    const token = req.cookies.accessToken;
    if (!token) {
      return next(new ApiError("No token provided, please login", 401));
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET_ACCESS);
        await User.updateOne({ _id: decoded.id }, { $inc: { tokenVersion: 1 } });
        logger.info("Auth: tokenVersion incremented on signout", { userId: decoded.id });
      } catch (err) {
        logger.warn("Auth: signout token verification failed", { message: err.message, stack: err.stack });
        return next(new ApiError("Invalid or expired token, please login again", 401));
      }
    }

    res.clearCookie("refreshToken", {
      httpOnly: true,
      sameSite: "Strict",
    });
    res.clearCookie("accessToken", {
      httpOnly: true,
      sameSite: "Strict",
    });

    logger.info("Auth: signout success");
    return sendResponse(res, 200, "success", "Signout successful");
  } catch (e) {
    return next(new ApiError("Failed to sign out", 500));
  }
});


const forgetPassword = asyncErrorHandler(async (req, res, next) => {
  const raw = req.body.email || "";
  const email = String(raw).trim().toLowerCase();

  const genericOk = () =>
    sendResponse(res, 200, "success", "If this email exists, a reset link has been sent.");

  if (!email) return genericOk();

  const user = await User.findOne({ email });
  if (!user) return genericOk();

  const now = new Date();
  if (
    user.passwordResetLastSentAt &&
    (now - new Date(user.passwordResetLastSentAt)) / 1000 < RESET_RESEND_COOLDOWN_SECONDS
  ) {
    return genericOk();
  }

  const { token, hash } = generatePasswordResetToken();
  user.passwordResetTokenHash = hash;
  user.passwordResetExpiresAt = new Date(now.getTime() + RESET_TOKEN_TTL_MIN * 60 * 1000);
  user.passwordResetLastSentAt = now;
  await user.save();

  const resetUrl = `${FRONTEND_URL}/auth/reset-password?token=${token}`;
  await sendPasswordResetEmail(user.email, resetUrl);
  logger.info("Auth: password reset email sent", { userId: user._id.toString(), email: user.email });

  return genericOk();
});

const resetPassword = asyncErrorHandler(async (req, res, next) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return next(new ApiError("Token and new password are required"));
  }
const {valid, errors} = passwordValidator.validatePasswordUsingLib(newPassword);
  if (!valid) {
    logger.warn("Auth: reset password invalid password", { errors });
    return next(new ApiError("Invalid password", 400));
  }

  const tokenHash = hashPasswordResetToken(token);
  const user = await User.findOne({
    passwordResetTokenHash: tokenHash,
    passwordResetExpiresAt: { $gt: new Date() },
  }).select("+password");

  if (!user) {
    return next(new ApiError("Invalid or expired reset token."));
  }


  user.password = await bcrypt.hash(newPassword, 10);
 
  user.passwordResetTokenHash = null;
  user.passwordResetExpiresAt = null;
  user.passwordResetLastSentAt = null;
  await user.save();

  logger.info("Auth: password reset success", { userId: user._id, email: user.email });

  
  const RefreshToken = generateRefreshToken(user);
  const accessToken = generateAccessToken(user);

  res.cookie("refreshToken", RefreshToken, {
    httpOnly: true,
    sameSite: "Strict", 
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
    res.cookie("accessToken", accessToken, {
    httpOnly: true,
    sameSite: "Strict",
    maxAge: 15 * 60 * 1000,
  });

  return sendResponse(res, 200, "success", "Password has been reset successfully.", {
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      provider: user.provider,
    }
  });
});

const getUserInfo = asyncErrorHandler(async(req,res,next) => {
    const {id,role,isEmailVerified} = req.user;
    if(!req.user || !id) {
        return next (new ApiError("User not authenticated",401));
    }
    logger.info("Auth: get user info");
    return sendResponse(res,200,"success","User info retrieved",{
        user: {
            id,
            role,
            isEmailVerified
        }
    })
});

module.exports = {
  signup,
  signin,
  verifyEmail,
  resendVerification,
  callback,
  signout,
  forgetPassword,
  resetPassword,
  newAccessToken,
  getUserInfo
};
