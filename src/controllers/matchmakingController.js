// src/controllers/matchmakingController.js
import createError from "http-errors";
import Match from "../models/Match.js";

/**
 * In-memory matchmaking queue
 * NOTE: For true horizontal scaling, replace with Redis later.
 */
const queue = new Set();

function getUserId(req) {
  // requireAuth sets req.user = { sub, email, role ... }
  const uid = req.user || null;
  if (!uid) {
    const err = createError(401, "UNAUTHORIZED");
    err.code = "UNAUTHORIZED";
    throw err;
  }
  return uid.toString();
}

/**
 * GET /api/matchmaking/status
 */
export async function getQueueStatus(_req, res) {
  return res.ok({
    queueSize: queue.size,
  });
}

/**
 * POST /api/matchmaking/join
 */
export async function joinQueue(req, res) {
  const userId = getUserId(req);

  if (queue.has(userId)) {
    const err = createError(409, "Already in matchmaking queue");
    err.code = "ALREADY_IN_QUEUE";
    throw err;
  }

  queue.add(userId);

  return res.ok({
    message: "Joined matchmaking queue",
    queueSize: queue.size,
  });
}

/**
 * POST /api/matchmaking/leave
 */
export async function leaveQueue(req, res) {
  const userId = getUserId(req);

  if (!queue.has(userId)) {
    const err = createError(404, "Not in matchmaking queue");
    err.code = "NOT_IN_QUEUE";
    throw err;
  }

  queue.delete(userId);

  return res.ok({
    message: "Left matchmaking queue",
    queueSize: queue.size,
  });
}

/**
 * GET /api/matchmaking/active
 */
export async function getActiveMatches(req, res) {
  const userId = getUserId(req);

  const matches = await Match.find({
    "players.userId": userId,
    status: { $in: ["pending", "active"] },
  }).sort({ createdAt: -1 });

  return res.ok({ matches });
}

/**
 * POST /api/matchmaking/admin/flush
 * ADMIN ONLY
 */
export async function adminFlushQueue(_req, res) {
  queue.clear();
  return res.ok({ message: "Matchmaking queue flushed" });
}

/**
 * OPTIONAL: hook used by socket challenge accept
 */
export async function onChallengeAccepted({ matchId, fromUserId, toUserId }) {
  if (fromUserId) queue.delete(fromUserId.toString());
  if (toUserId) queue.delete(toUserId.toString());
  return { matchId };
}

/**
 * Export initializer so sockets can reuse hooks safely
 */
export function initializeMatchmaking() {
  return {
    onChallengeAccepted,
  };
}
