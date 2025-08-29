const ApiError = require("../utils/ApiError");
const logger = require("../utils/logger");


const sendErrorForDev = (err, res) => {
  res.status(err.statusCode).json({
    status: err.status,
    error: err,
    message: err.message,
    stack: err.stack,
    timestamp: new Date().toLocaleString(),
    path: res.req?.originalUrl,
    method: res.req?.method,
    header: res.req?.headers,
  });
};

const sendErrorForProd = (err, res) => {
  res.status(err.statusCode).json({
    status: err.status,
    message: err.isExpected ? err.message : "Something went wrong!",
    timestamp: new Date().toISOString(),
  });
};

// JWT error handlers
const handleJwtInvalidSignature = () =>
  new ApiError("Invalid token, please login again", 401);

const handleJwtExpired = () =>
  new ApiError("Your token has expired, please login again ", 401);

// Multer error handlers
const handleMulterErrors = (err) => {
  if (err.code === "LIMIT_FILE_SIZE") {
    return new ApiError("File too large. Maximum size allowed is 10MB", 400);
  }
  if (err.code === "LIMIT_FILE_COUNT") {
    return new ApiError("Too many files uploaded", 400);
  }
  if (err.code === "LIMIT_UNEXPECTED_FILE") {
    return new ApiError(`Unexpected field: ${err.field}`, 400);
  }
  if (err.code === "LIMIT_PART_COUNT") {
    return new ApiError("Too many parts in multipart data", 400);
  }
  if (err.message && err.message.includes("Invalid file type")) {
    return new ApiError(
      "Invalid file type. Please upload a supported file format",
      400
    );
  }
  return err;
};
const handleSystemErrors = (err) => {
  if (err.code === "ENOENT") {
    return new ApiError("File or directory not found", 404);
  }
  if (err.code === "EACCES") {
    return new ApiError("Permission denied to access the resource", 403);
  }
  if (err.code === "EMFILE") {
    return new ApiError("Too many open files on the server", 503);
  }
  if (err.code === "ECONNREFUSED") {
    return new ApiError("Connection refused by the server", 503);
  }
  if (err.code === "ETIMEDOUT") {
    return new ApiError("The network operation timed out", 504);
  }
  if (err.code === "EHOSTUNREACH") {
    return new ApiError("The host is unreachable", 503);
  }
  return err; // Return the original error if not handled
};

// MongoDB error handlers
const handleMongoErrors = (err) => {
  if (err.name === "ValidationError") {
    const errors = Object.values(err.errors).map((val) => val.message);
    return new ApiError(`Validation Error: ${errors.join(". ")}`, 400);
  }
  if (err.name === "CastError") {
    return new ApiError(`Invalid ${err.path}: ${err.value}`, 400);
  }
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const value = err.keyValue[field];
    return new ApiError(
      `Duplicate field value: ${field} = ${value}. Please use another value!`,
      400
    );
  }
  if (err.name === "MongoNetworkError") {
    return new ApiError("Database connection failed", 500);
  }
  if (err.name === "MongoServerError") {
    return new ApiError("Database server error", 500);
  }
  return err; // Return the original error if not handled
};

// Global error handler middleware
const globalError = (err, req, res, next) => {
  // Set default values
  err.statusCode = err.statusCode || 500;
  err.status = err.status || "error";

  logger.error("Error caught by global handler", {
    name: err.name,
    message: err.message,
    stack: err.stack,
    statusCode: err.statusCode,
    url: req.originalUrl,
    method: req.method,
    body: req.body,
    params: req.params,
    query: req.query,
    ip: req.ip,
  });

  // Log error for debugging (in development or with proper logger)
  if (process.env.NODE_ENV === "development") {
    console.error("Error Details:", {
      name: err.name,
      message: err.message,
      stack: err.stack,
      path: req.originalUrl,
      method: req.method,
      body: req.body,
      params: req.params,
      query: req.query,
      header: req.headers,
    });
  }

  if (process.env.NODE_ENV === "development") {
    sendErrorForDev(err, res);
  } else {
    let error = { ...err };
    error.message = err.message;

    // Handle JWT errors
    if (err.name === "JsonWebTokenError") {
      error = handleJwtInvalidSignature();
    }
    if (err.name === "TokenExpiredError") {
      error = handleJwtExpired();
    }

    // Handle Multer errors
    if (err.code && err.code.startsWith("LIMIT_")) {
      error = handleMulterErrors(err);
    }

    // Handle system-level errors
    error = handleSystemErrors(error);

    // Handle MongoDB-related errors
    error = handleMongoErrors(error);

    // Handle any unexpected errors
    if (!error.isExpected) {
      console.error("Unexpected Error:", {
        name: error.name,
        message: error.message,
        stack: error.stack,
        url: req.originalUrl,
      });
      logger.error("Unexpected error", {
        name: error.name,
        message: error.message,
        stack: error.stack,
        url: req.originalUrl,
      });
      error = new ApiError("Something went wrong!", 500);
    }

    sendErrorForProd(error, res);
  }
};

const handleNotFound = (req, res, next) => {
  const error = new ApiError(`Route ${req.originalUrl} not found`, 404);
  next(error);
};

module.exports = { globalError, handleNotFound };
