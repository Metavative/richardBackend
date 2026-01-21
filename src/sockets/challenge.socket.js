// src/sockets/challenge.socket.js
import createError from "http-errors";
import Match from "../models/Match.js";
import User from "../models/User.js";
import { challengeStore } from "../stores/challenge.store.js";

/**
 * Socket events:
 * - challenge:send    { toUserId }                (ack)
 * - challenge:accept  { challengeId }             (ack -> returns matchId)
 * - challenge:decline { challengeId }             (ack)
 *
 * Emits:
 * - challenge:incoming   { challenge }
 * - challenge:updated    { challenge }
 * - challenge:match_ready{ matchId, match, challenge }
 */
export function bindChallengeSockets(io, { matchmakingService } = {}) {
  io.on("connection", (socket) => {
    const myUserId = socket?.data?.user?.userId || null;

    const ackOk = (ack, data = {}) => {
      if (typeof ack === "function") ack({ ok: true, ...data });
    };

    const ackErr = (ack, err, fallbackCode, fallbackMessage) => {
      if (typeof ack !== "function") return;

      const status = err?.status || err?.statusCode || 500;
      const code =
        err?.code ||
        (status === 401
          ? "UNAUTHORIZED"
          : status === 403
            ? "FORBIDDEN"
            : status === 404
              ? "NOT_FOUND"
              : fallbackCode || "SOCKET_ERROR");

      ack({
        ok: false,
        error: {
          code,
          message: err?.message || fallbackMessage || "Something went wrong",
        },
      });
    };

    socket.on("challenge:send", async (payload, ack) => {
      try {
        if (!myUserId) throw createError(401, "Authentication required");

        const toUserId = payload?.toUserId?.toString?.().trim();
        if (!toUserId) throw createError(400, "Missing toUserId");
        if (toUserId === myUserId) throw createError(400, "Cannot challenge yourself");

        // Validate target exists
        const target = await User.findById(toUserId).select("_id").lean();
        if (!target) throw createError(404, "Target user not found");

        // Create challenge
        const challenge = challengeStore.create({ fromUserId: myUserId, toUserId });

        // Notify opponent (user room)
        io.to(`user:${toUserId}`).emit("challenge:incoming", { challenge });

        ackOk(ack, { challenge });
      } catch (err) {
        ackErr(ack, err, "CHALLENGE_SEND_FAILED", "Failed to send challenge");
      }
    });

    socket.on("challenge:decline", async (payload, ack) => {
      try {
        if (!myUserId) throw createError(401, "Authentication required");

        const challengeId = payload?.challengeId?.toString?.().trim();
        if (!challengeId) throw createError(400, "Missing challengeId");

        const c = challengeStore.get(challengeId);
        if (!c) throw createError(404, "Challenge not found");

        if (c.toUserId !== myUserId) throw createError(403, "Not your challenge");
        if (c.status !== "pending") throw createError(400, "Challenge is not pending");

        const updated = challengeStore.updateStatus(challengeId, "declined");

        io.to(`user:${c.fromUserId}`).emit("challenge:updated", { challenge: updated });
        io.to(`user:${c.toUserId}`).emit("challenge:updated", { challenge: updated });

        ackOk(ack, { challenge: updated });
      } catch (err) {
        ackErr(ack, err, "CHALLENGE_DECLINE_FAILED", "Failed to decline challenge");
      }
    });

    socket.on("challenge:accept", async (payload, ack) => {
      try {
        if (!myUserId) throw createError(401, "Authentication required");

        const challengeId = payload?.challengeId?.toString?.().trim();
        if (!challengeId) throw createError(400, "Missing challengeId");

        const c = challengeStore.get(challengeId);
        if (!c) throw createError(404, "Challenge not found");

        if (c.toUserId !== myUserId) throw createError(403, "Not your challenge");
        if (c.status !== "pending") throw createError(400, "Challenge is not pending");

        const updated = challengeStore.updateStatus(challengeId, "accepted");

        // Create match in DB so both devices share a stable matchId
        const match = await Match.create({
          gameMode: "1v1",
          region: "global",
          status: "pending",
          players: [
            { userId: c.fromUserId, team: "red", connected: true, ready: true },
            { userId: c.toUserId, team: "blue", connected: true, ready: true },
          ],
          settings: {
            maxPlayers: 2,
            duration: 600,
            isRanked: false,
            allowSpectators: false,
          },
        });

        const matchId = match.matchId || match._id?.toString?.();

        // Optional: hook into matchmaking service if you want it to manage match rooms
        // (safe no-op if matchmakingService is not passed or doesn't support it)
        try {
          if (matchmakingService?.onChallengeAccepted) {
            await matchmakingService.onChallengeAccepted({
              matchId,
              fromUserId: c.fromUserId,
              toUserId: c.toUserId,
            });
          }
        } catch (_ignored) {
          // intentionally ignore so match creation doesn’t fail
        }

        io.to(`user:${c.fromUserId}`).emit("challenge:match_ready", {
          matchId,
          match,
          challenge: updated,
        });
        io.to(`user:${c.toUserId}`).emit("challenge:match_ready", {
          matchId,
          match,
          challenge: updated,
        });

        ackOk(ack, { matchId, match, challenge: updated });
      } catch (err) {
        ackErr(ack, err, "CHALLENGE_ACCEPT_FAILED", "Failed to accept challenge");
      }
    });
  });
}
