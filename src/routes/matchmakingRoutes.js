import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  joinQueue,
  leaveQueue,
  getMatchStatus,
  getMatch,
  setPlayerReady,
  getMatchmakingStats,
  cancelMatch,
  completeMatch,
} from "../controllers/matchmakingController.js";

const router = Router();

// All routes require authentication
router.use(requireAuth);

// Matchmaking queue operations
router.post("/queue/join", joinQueue);
router.post("/queue/leave", leaveQueue);

// Match operations
router.get("/match/status", getMatchStatus);
router.get("/match/:matchId", getMatch);
router.post("/match/ready", setPlayerReady);
router.post("/match/:matchId/complete", completeMatch);

// Admin routes
router.get("/admin/stats", getMatchmakingStats);
router.post("/admin/match/:matchId/cancel", cancelMatch);

// Health check
router.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "matchmaking",
    timestamp: new Date().toISOString(),
  });
});

export default router;
