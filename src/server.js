// src/server.js
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
import { initSockets } from "./sockets/index.js";
import { errorHandler, notFound } from "./middleware/error.middleware.js";
import { requestIdMiddleware } from "./middleware/requestId.middleware.js";

const app = express();

// Behind Railway / reverse proxies
app.set("trust proxy", 1);

// ---------- MIDDLEWARE ----------
const allowedOrigins = new Set(
  [
    env.CLIENT_URL,
    // Local dev / emulators
    "http://localhost:3000",
    "http://localhost",
    "http://10.0.2.2",
    "http://127.0.0.1:3000",
    // Optional comma-separated allowlist
    ...(String(process.env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)),
  ].filter(Boolean)
);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.has(origin)) return callback(null, true);

      // In production, reject unknown origins
      if (env.NODE_ENV === "production") {
        return callback(new Error("CORS: Origin not allowed"));
      }

      // In development, allow for convenience
      return callback(null, true);
    },
    credentials: true,
  })
);

app.use(helmet());
app.use(morgan("dev"));
app.use(express.json());
app.use(cookieParser());

// Attach X-Request-Id for logging + client debugging
app.use(requestIdMiddleware);

// Static uploads
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// ---------- ROUTES ----------
app.use("/api", routes);

app.get("/api/test", (_req, res) => {
  console.log("✅ /api/test hit");
  res.json({
    status: "success",
    message: "Backend is working!",
    timestamp: new Date().toISOString(),
  });
});

app.get("/health-check", (_req, res) => {
  res.json({
    status: "healthy",
    service: "LA-TREL Backend",
    version: "1.0.0",
    time: new Date().toISOString(),
  });
});

// ---------- 404 + ERROR HANDLERS (LAST) ----------
app.use(notFound);
app.use(errorHandler);

// ---------- HTTP SERVER & SOCKET.IO ----------
const server = http.createServer(app);

export const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      // socket.io may pass undefined for same-origin / native clients
      if (!origin) return callback(null, true);
      if (allowedOrigins.has(origin)) return callback(null, true);
      if (env.NODE_ENV === "production") return callback(new Error("CORS"));
      return callback(null, true);
    },
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// ✅ Keep your existing matchmaking
const matchmakingService = initializeMatchmaking(io);

// ✅ Add all realtime systems (presence + challenges + checkers)
initSockets(io, { matchmakingService });

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
