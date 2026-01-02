import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import http from "http";
import { Server } from "socket.io";

import { env } from "./config/env.js";
import { connectDB } from "./config/db.js";
import routes from "./routes/index.js";
import { initializeMatchmaking } from "./controllers/matchmakingController.js";

const app = express();

// ---------- MIDDLEWARE ----------
const allowedOrigins = new Set([
  "http://localhost:3000",
  "http://localhost",
  "http://10.0.2.2",
  "http://127.0.0.1:3000",
]);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.has(origin)) return callback(null, true);
      return callback(null, true);
    },
    credentials: true,
  })
);

app.use(helmet());
app.use(morgan("dev"));
app.use(express.json());
app.use(cookieParser());

// Static uploads
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Request logging
app.use((req, _res, next) => {
  console.log(`ℹ ${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// ---------- ROUTES ----------
app.use("/api", routes);

app.get("/api/test", (req, res) => {
  console.log("✅ /api/test hit");
  res.json({
    status: "success",
    message: "Backend is working!",
    timestamp: new Date().toISOString(),
  });
});

app.get("/health-check", (req, res) => {
  res.json({
    status: "healthy",
    service: "LA-TREL Backend",
    version: "1.0.0",
    time: new Date().toISOString(),
  });
});

// ---------- ERROR HANDLER (MUST BE BEFORE 404) ----------
app.use((err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;

  console.error("❌ Server Error:", {
    status,
    message: err.message,
    stack: err.stack,
    details: err.errors || err.detail || null,
    path: req.originalUrl,
    method: req.method,
  });

  // Mongo duplicate key (email/username unique)
  if (err?.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || "field";
    return res.status(409).json({
      message: `${field} already exists`,
      field,
    });
  }

  // Mongoose validation
  if (err?.name === "ValidationError") {
    const errors = Object.values(err.errors || {}).map((e) => e.message);
    return res.status(400).json({
      message: "Validation failed",
      errors,
    });
  }

  // Default (return REAL message)
  const payload = {
    message: err.message || "Server Error",
  };

  // Helpful debugging in non-production
  if (env.NODE_ENV !== "production") {
    payload.stack = err.stack;
    payload.details = err.errors || null;
  }

  return res.status(status).json(payload);
});

// ---------- 404 HANDLER (LAST) ----------
app.use((req, res) => {
  console.log(`❌ 404 - Route not found: ${req.method} ${req.url}`);
  res.status(404).json({
    message: "Route not found",
    path: req.url,
    method: req.method,
  });
});

// ---------- HTTP SERVER & SOCKET.IO ----------
const server = http.createServer(app);

export const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// Initialize matchmaking service with io
initializeMatchmaking(io);

io.on("connection", (socket) => {
  console.log("� USER CONNECTED:", socket.id);
  socket.on("disconnect", () => console.log("� USER DISCONNECTED:", socket.id));
});

// ---------- START ----------
try {
  await connectDB();
  console.log("✅ MongoDB connected");

  server.listen(env.PORT, () => {
    console.log(`� Server running on port: ${env.PORT}`);
  });
} catch (err) {
  console.error("❌ Startup error:", err.message);
  process.exit(1);
}
