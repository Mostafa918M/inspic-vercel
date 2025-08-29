const { createLogger, format, transports } = require("winston");
const { combine, timestamp, printf, colorize } = format;

const consoleFormat = combine(
  colorize(),
  timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  printf(({ level, message, timestamp }) => {
    return `${timestamp} [${level}] : ${message}`;
  })
);

const fileFormat = combine(
  timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  printf(({ level, message, timestamp }) => {
    return `${timestamp} [${level}] : ${message}`;
  })
);

const logger = createLogger({
  level: "info",
  transports: [
    new transports.Console({ format: consoleFormat }),
    new transports.File({ filename: "logs/app.log", format: fileFormat }),
    new transports.File({ filename: "logs/error.log", level: "error", format: fileFormat }),
  ],
});

module.exports = logger;
