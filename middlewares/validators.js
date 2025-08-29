const { body, validationResult } = require("express-validator");
const sendResponse = require("../utils/sendResponse");

const emailValidator = [
  body("email")
    .trim()
    .normalizeEmail({ all_lowercase: true })
    .isEmail()
    .withMessage("Please provide a valid email address"),

  (req, res, next) => {
     if (req.body.email) {
      req.body.email = String(req.body.email).trim().toLowerCase();
    }
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        sendResponse(res, 400, "error", "Validation failed", {
          errors: errors.array().map(err => err.msg),
        });
      return;
    }
    next();
  },
];

module.exports = { emailValidator };