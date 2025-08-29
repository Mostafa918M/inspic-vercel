require("dotenv").config();
const express = require('express')
const cookieParser = require('cookie-parser');
const path = require("path");
const cors = require('cors');

const { handleNotFound, globalError } = require('./middlewares/globalErrorHandler');

// Import routes
const authRoute = require('./routes/auth.route');
const userRoute = require('./routes/user.route');
const pinRoute = require('./routes/pin.route');
const boardRoute = require('./routes/board.route');




const app = express()

const allowedOrigins = [process.env.FRONTEND_URL_PROD,https://inspic-vercel.vercel.app];
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
    methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

const UPLOADS_ROOT = path.resolve("uploads");
app.use(express.json());
app.use(cookieParser());
app.get("/", (req, res) => res.send("Hello from Vercel + Express!"));

app.use('/media',  express.static(UPLOADS_ROOT, {
    setHeaders: (res, filePath) => {
      if (!filePath.includes(path.sep + "public" + path.sep)) {
        res.statusCode = 404;
      } else {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  })
);
app.use('/uploads',  express.static(UPLOADS_ROOT));

app.use('/api/v1/auth', authRoute);
app.use('/api/v1/users',userRoute);
app.use('/api/v1/pins', pinRoute);
app.use('/api/v1/boards', boardRoute);

app.use(handleNotFound);
app.use(globalError);

module.exports = app
