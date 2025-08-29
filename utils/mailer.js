const nodemailer = require("nodemailer");
const ApiError = require("../utils/ApiError");

function required(name) {
  if (!process.env[name]) throw new ApiError(`Missing env: ${name}`);
  return process.env[name];
}
const transporter = nodemailer.createTransport({
  host: required("SMTP_HOST"),
  port: required("SMTP_PORT"),
  secure: false,
  auth: {
    user: required("SMTP_USER"),
    pass: required("SMTP_PASS"),
  },
  requireTLS: true,
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 20_000,
});

async function sendVerificationEmail(to, code) {
  const subject = "Your verification code";
  const html = `
    <div style="font-family:Arial,sans-serif;font-size:16px;">
      <p>Use this code to verify your email:</p>
      <p style="font-size:24px;letter-spacing:4px;"><b>${code}</b></p>
      <p>This code expires in 15 minutes.</p>
      <p>If you didn’t request this, you can ignore this email.</p>
    </div>
  `;

  await transporter.sendMail({
    from: process.env.MAIL_FROM || '"No Reply" <no-reply@example.com>',
    to,
    subject,
    html,
  });
}
async function sendPasswordResetEmail(to, resetUrl) {
  const subject = "Reset your password";
  const html = `
    <div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5">
      <p>We received a request to reset your password.</p>
      <p><a href="${resetUrl}" style="display:inline-block;padding:10px 16px;text-decoration:none;border-radius:6px;background:#0b5cff;color:#fff;">Reset Password</a></p>
      <p>If the button doesn’t work, copy and paste this URL:</p>
      <p style="word-break:break-all">${resetUrl}</p>
      <p>This link expires in 30 minutes. If you didn’t request this, you can ignore this email.</p>
    </div>
  `;
  await transporter.sendMail({
    from: process.env.MAIL_FROM || '"No Reply" <no-reply@example.com>',
    to, subject, html,
  });
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail };
