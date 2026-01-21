// src/sockets/challenge.socket.js
import User from "../models/User.js";
import { isOnline, getUser as getPresenceUser, setStatus } from "../stores/presence.store.js";
import { createChallenge, getChallenge, updateChallengeStatus, sweepExpired } from "../stores/challenge.store.js";
import { createMatch } from "../stores/checkersMatch.store.js";

export const ChallengeEvents = {
  send: "challenge:send",
  cancel: "challenge:cancel",
  respond: "challenge:respond",

  sent: "challenge:sent",
  incoming: "challenge:incoming",
  update: "challenge:update",
  error: "challenge:error",

  matchCreated: "match:created",
};

function ensureAuthed(socket) {
  const uid = socket.userId ? String(socket.userId).trim() : "";
  return uid.length ? uid : null;
}

function safeProfileFromUser(user) {
  if (!user) return undefined;
  return {
    id: user._id?.toString?.() || undefined,
    name: user.name || undefined,
    email: user.email || undefined,
    avatarUrl: user.profile_picture?.url || undefined,
  };
}

async function loadProfile(userId) {
  try {
    const u = await User.findById(userId).select("name email profile_picture.url");
    return safeProfileFromUser(u);
  } catch {
    return undefined;
  }
}

// Sweep expired challenges and notify both sides
let _sweeperStarted = false;
function startSweeper(io) {
  if (_sweeperStarted) return;
  _sweeperStarted = true;

  setInterval(() => {
    const expired = sweepExpired();
    for (const ch of expired) {
      io.to(`user:${ch.fromUserId}`).emit(ChallengeEvents.update, {
        challengeId: ch.challengeId,
        status: "expired",
        ts: Date.now(),
      });
      io.to(`user:${ch.toUserId}`).emit(ChallengeEvents.update, {
        challengeId: ch.challengeId,
        status: "expired",
        ts: Date.now(),
      });
    }
  }, 2000);
}

export function registerChallengeSockets(io) {
  startSweeper(io);

  io.on("connection", (socket) => {
    const uid = ensureAuthed(socket);
    if (uid) socket.join(`user:${uid}`);

    socket.on(ChallengeEvents.send, async (payload = {}) => {
      const fromUserId = ensureAuthed(socket);
      if (!fromUserId) {
        socket.emit(ChallengeEvents.error, {
          code: "UNAUTHENTICATED",
          message: "Missing/invalid socket token",
          ts: Date.now(),
        });
        return;
      }

      const toUserId = String(payload?.toUserId || "").trim();
      const game = String(payload?.game || "checkers").trim() || "checkers";

      if (!toUserId) {
        socket.emit(ChallengeEvents.error, { code: "BAD_PAYLOAD", message: "toUserId required", ts: Date.now() });
        return;
      }
      if (toUserId === fromUserId) {
        socket.emit(ChallengeEvents.error, { code: "BAD_TARGET", message: "Cannot challenge yourself", ts: Date.now() });
        return;
      }

      // must be online
      if (!isOnline(toUserId)) {
        socket.emit(ChallengeEvents.error, { code: "USER_OFFLINE", message: "User is offline", ts: Date.now() });
        return;
      }

      // basic availability gate
      const p = getPresenceUser(toUserId);
      if (p?.status && p.status !== "available") {
        socket.emit(ChallengeEvents.error, { code: "USER_BUSY", message: "User is not available", ts: Date.now() });
        return;
      }

      const { challenge, reused } = createChallenge({
        fromUserId,
        toUserId,
        game,
        ttlMs: 45000,
        meta: {
          blockersEnabled: payload?.blockersEnabled ?? true,
          boardDifficultyKey: payload?.boardDifficultyKey ?? "advanced",
          aiDifficultyKey: payload?.aiDifficultyKey ?? "easy",
        },
      });

      // Notify sender
      socket.emit(ChallengeEvents.sent, {
        challengeId: challenge.challengeId,
        toUserId,
        game,
        expiresAt: challenge.expiresAt,
        reused,
        ts: Date.now(),
      });

      // Notify target
      const fromProfile = await loadProfile(fromUserId);
      io.to(`user:${toUserId}`).emit(ChallengeEvents.incoming, {
        challengeId: challenge.challengeId,
        fromUserId,
        fromProfile,
        game,
        expiresAt: challenge.expiresAt,
        meta: challenge.meta,
        ts: Date.now(),
      });
    });

    socket.on(ChallengeEvents.cancel, (payload = {}) => {
      const fromUserId = ensureAuthed(socket);
      if (!fromUserId) {
        socket.emit(ChallengeEvents.error, { code: "UNAUTHENTICATED", message: "Missing/invalid token", ts: Date.now() });
        return;
      }

      const challengeId = String(payload?.challengeId || "").trim();
      if (!challengeId) {
        socket.emit(ChallengeEvents.error, { code: "BAD_PAYLOAD", message: "challengeId required", ts: Date.now() });
        return;
      }

      const ch = getChallenge(challengeId);
      if (!ch) {
        socket.emit(ChallengeEvents.error, { code: "NOT_FOUND", message: "Challenge not found", ts: Date.now() });
        return;
      }
      if (ch.status !== "pending") {
        socket.emit(ChallengeEvents.error, { code: "NOT_PENDING", message: "Challenge is not pending", ts: Date.now() });
        return;
      }
      if (ch.fromUserId !== fromUserId) {
        socket.emit(ChallengeEvents.error, { code: "FORBIDDEN", message: "Only sender can cancel", ts: Date.now() });
        return;
      }

      updateChallengeStatus(challengeId, "cancelled");

      io.to(`user:${ch.fromUserId}`).emit(ChallengeEvents.update, {
        challengeId,
        status: "cancelled",
        ts: Date.now(),
      });
      io.to(`user:${ch.toUserId}`).emit(ChallengeEvents.update, {
        challengeId,
        status: "cancelled",
        ts: Date.now(),
      });
    });

    socket.on(ChallengeEvents.respond, async (payload = {}) => {
      const toUserId = ensureAuthed(socket);
      if (!toUserId) {
        socket.emit(ChallengeEvents.error, { code: "UNAUTHENTICATED", message: "Missing/invalid token", ts: Date.now() });
        return;
      }

      const challengeId = String(payload?.challengeId || "").trim();
      const action = String(payload?.action || "").trim().toLowerCase(); // accept|decline

      if (!challengeId || !["accept", "decline"].includes(action)) {
        socket.emit(ChallengeEvents.error, { code: "BAD_PAYLOAD", message: "challengeId + action required", ts: Date.now() });
        return;
      }

      const ch = getChallenge(challengeId);
      if (!ch) {
        socket.emit(ChallengeEvents.error, { code: "NOT_FOUND", message: "Challenge not found", ts: Date.now() });
        return;
      }

      // Only recipient can respond
      if (ch.toUserId !== toUserId) {
        socket.emit(ChallengeEvents.error, { code: "FORBIDDEN", message: "Only recipient can respond", ts: Date.now() });
        return;
      }

      // Must be pending and not expired
      if (ch.status !== "pending") {
        socket.emit(ChallengeEvents.error, { code: "NOT_PENDING", message: `Challenge is ${ch.status}`, ts: Date.now() });
        return;
      }
      if (ch.expiresAt <= Date.now()) {
        updateChallengeStatus(challengeId, "expired");
        socket.emit(ChallengeEvents.error, { code: "EXPIRED", message: "Challenge expired", ts: Date.now() });
        return;
      }

      if (action === "decline") {
        updateChallengeStatus(challengeId, "declined");

        io.to(`user:${ch.fromUserId}`).emit(ChallengeEvents.update, {
          challengeId,
          status: "declined",
          ts: Date.now(),
        });
        io.to(`user:${ch.toUserId}`).emit(ChallengeEvents.update, {
          challengeId,
          status: "declined",
          ts: Date.now(),
        });
        return;
      }

      // Accept
      updateChallengeStatus(challengeId, "accepted");

      // Mark both in_game
      setStatus({ userId: ch.fromUserId, status: "in_game" });
      setStatus({ userId: ch.toUserId, status: "in_game" });

      // Create a checkers match (authoritative state)
      const blockersEnabled = ch.meta?.blockersEnabled ?? true;
      const boardDifficultyKey = ch.meta?.boardDifficultyKey ?? "advanced";
      const aiDifficultyKey = ch.meta?.aiDifficultyKey ?? "easy";

      const match = createMatch({
        playerOneId: ch.fromUserId,
        playerTwoId: ch.toUserId,
        blockersEnabled,
        boardDifficultyKey,
        aiDifficultyKey,
      });

      const p1Profile = await loadProfile(match.playerOneId);
      const p2Profile = await loadProfile(match.playerTwoId);

      const matchData = {
        matchId: match.matchId,
        players: [
          { userId: match.playerOneId, profile: p1Profile },
          { userId: match.playerTwoId, profile: p2Profile },
        ],
        boardDifficultyKey,
        aiDifficultyKey,
        blockersEnabled,
      };

      // Notify challenge resolution
      io.to(`user:${ch.fromUserId}`).emit(ChallengeEvents.update, {
        challengeId,
        status: "accepted",
        matchId: match.matchId,
        ts: Date.now(),
      });
      io.to(`user:${ch.toUserId}`).emit(ChallengeEvents.update, {
        challengeId,
        status: "accepted",
        matchId: match.matchId,
        ts: Date.now(),
      });

      // Send match:created to both users
      io.to(`user:${ch.fromUserId}`).emit(ChallengeEvents.matchCreated, {
        matchId: match.matchId,
        matchData,
        ts: Date.now(),
      });
      io.to(`user:${ch.toUserId}`).emit(ChallengeEvents.matchCreated, {
        matchId: match.matchId,
        matchData,
        ts: Date.now(),
      });
    });
  });
}
