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

// CORS - allow Flutter emulator & local web
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://10.0.2.2",
      "http://localhost",
      "*",
    ],
    credentials: true,
  })
);

app.use(helmet());
app.use(morgan("dev"));
app.use(express.json()); // ✅ body parser (must be before routes)
app.use(cookieParser());

// Static uploads
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Request logging
app.use((req, res, next) => {
  console.log(`📡 ${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// ---------- ROUTES ----------

// All API routes under /api
app.use("/api", routes);

// Optional extra test endpoint
app.get("/api/test", (req, res) => {
  console.log("✅ /api/test hit");
  res.json({
    status: "success",
    message: "Backend is working!",
    timestamp: new Date().toISOString(),
    endpoints: {
      health: "/health",
      matchmakingJoin: "/api/matchmaking/queue/join",
    },
  });
});

// Health endpoint (root-level)
app.get("/health-check", (req, res) => {
  res.json({
    status: "healthy",
    service: "LA-TREL Backend",
    version: "1.0.0",
    time: new Date().toISOString(),
  });
});

// 404 handler
app.use((req, res) => {
  console.log(`❌ 404 - Route not found: ${req.method} ${req.url}`);
  res.status(404).json({
    message: "Route not found",
    path: req.url,
    method: req.method,
    availableRoutes: [
      "GET /health",
      "GET /api/health",
      "GET /api/test",
      "POST /api/auth/login",
      "POST /api/ai/coach",
      "POST /api/friends/request",
      "POST /api/matchmaking/queue/join",
    ],
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("❌ Server Error:", err.stack);
  res.status(err.status || 500).json({
    message: "Server Error",
    error: err.message,
    timestamp: new Date().toISOString(),
  });
});

// ---------- HTTP SERVER & SOCKET.IO ----------

const server = http.createServer(app);
export const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// ✅ Initialize matchmaking service with io
initializeMatchmaking(io);

io.on("connection", (socket) => {
  console.log("🟢 USER CONNECTED:", socket.id);

  socket.on("disconnect", () => {
    console.log("🔴 USER DISCONNECTED:", socket.id);
  });
});

// ---------- START ----------

try {
  await connectDB();
  console.log("✅ MongoDB connected");

  server.listen(env.PORT, () => {
    console.log(`🚀 Server running on http://localhost:${env.PORT}`);
    console.log(`📱 Flutter Emulator URL: http://10.0.2.2:${env.PORT}`);
    console.log(
      `🎯 Matchmaking Join: POST http://localhost:${env.PORT}/api/matchmaking/queue/join`
    );
  });
} catch (err) {
  console.error("❌ Startup error:", err.message);
  process.exit(1);
}
