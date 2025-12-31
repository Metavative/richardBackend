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

/**
 * CORS NOTE (important):
 * - You cannot use origin: "*" while credentials: true
 * - Flutter typically doesn't need cookies, but web might.
 * This setup allows common dev origins and also allows requests with no origin (mobile apps).
 */
const allowedOrigins = new Set([
  "http://localhost:3000",
  "http://localhost",
  "http://10.0.2.2",
  "http://127.0.0.1:3000",
]);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (Flutter mobile, Postman, curl)
      if (!origin) return callback(null, true);

      // Allow known dev origins
      if (allowedOrigins.has(origin)) return callback(null, true);

      // If you want to allow all origins in production without credentials,
      // set credentials:false and return true for all origins.
      return callback(null, true);
    },
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
app.use((req, _res, next) => {
  console.log(`� ${new Date().toISOString()} ${req.method} ${req.url}`);
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
      healthCheck: "/health-check",
      apiTest: "/api/test",

      // Friends
      friendsTest: "/api/friends/test",
      friendsSend: "POST /api/friends/send",
      friendsAccept: "PATCH /api/friends/accept/:id",
      friendsReject: "PATCH /api/friends/reject/:id",
      friendsAll: "GET /api/friends/all",
      friendsMine: "GET /api/friends/mine/:userId",

      // Users
      usersSearch: "GET /api/users/search?q=...",

      // Challenges (if you add it)
      challengesCreate: "POST /api/challenges/create",

      // Matchmaking
      matchmakingJoin: "POST /api/matchmaking/queue/join",
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
      "GET /health-check",
      "GET /api/test",

      // Auth (example)
      "POST /api/auth/login",

      // AI
      "POST /api/ai/coach",

      // Friends (real)
      "GET /api/friends/test",
      "POST /api/friends/send",
      "PATCH /api/friends/accept/:id",
      "PATCH /api/friends/reject/:id",
      "GET /api/friends/all",
      "GET /api/friends/mine/:userId",

      // Users
      "GET /api/users/search?q=...",

      // Matchmaking
      "POST /api/matchmaking/queue/join",

      // Challenges (optional)
      "POST /api/challenges/create",
    ],
  });
});

// Error handler
app.use((err, req, res, _next) => {
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
  console.log("� USER CONNECTED:", socket.id);

  socket.on("disconnect", () => {
    console.log("� USER DISCONNECTED:", socket.id);
  });
});

// ---------- START ----------

try {
  await connectDB();
  console.log("✅ MongoDB connected");

  server.listen(env.PORT, () => {
    console.log(`� Server running on http://localhost:${env.PORT}`);
    console.log(`� Flutter Emulator URL: http://10.0.2.2:${env.PORT}`);
    console.log(
      `� Matchmaking Join: POST http://localhost:${env.PORT}/api/matchmaking/queue/join`
    );
  });
} catch (err) {
  console.error("❌ Startup error:", err.message);
  process.exit(1);
}
