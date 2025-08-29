const mongoose = require("mongoose");
const logger = require("../utils/logger");
const chalk = require("chalk");

const MONGO_URI = process.env.MONGO_URI;
const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log(`${chalk.bgGreen.white.bold("   DB CONNECTED   ")}`);
    logger.info("DB Connected successfully");
  } catch (err) {
    console.log(`${chalk.bgRed.white.bold("   MONGO DB ERROR   ")}`);
    logger.error("DB CONNECTED ERROR:", {
      message: err.message,
      stack: err.stack,
    });
    process.exit(1);
  }
};
module.exports = connectDB;
