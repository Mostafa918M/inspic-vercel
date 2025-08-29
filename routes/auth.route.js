const express = require("express");
const { body } = require("express-validator");

const {
  signup,
  signin,
  verifyEmail,
  callback,
  signout,
  forgetPassword,
  resetPassword,
  resendVerification,
  newAccessToken,
  getUserInfo
} = require("../controllers/auth.controller");
const { emailValidator } = require("../middlewares/validators");
const  auth  = require("../middlewares/authMiddleware");

const router = express.Router();

router.get("/me",auth(), getUserInfo);
router.post(
  "/signup", emailValidator,signup
);
router.post("/signin",  emailValidator, signin);
router.post("/callback", callback);
router.post("/verify-email", verifyEmail);
router.post("/resend-verification", emailValidator, resendVerification);
router.post("/signout",signout)

router.post("/forget-password", emailValidator, forgetPassword);
router.post("/reset-password", resetPassword);
router.post("/refresh-token", newAccessToken);

module.exports = router;
