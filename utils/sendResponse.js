module.exports = (res, statusCode, status, message, data = {}) => {
  res.status(statusCode).json({
    status, // "success" | "fail" | "error"
    message,
    data,
    timestamp: new Date().toISOString(),
  });
};