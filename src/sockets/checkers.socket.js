// src/sockets/checkers.socket.js
import Match from "../models/Match.js";
import { checkersStore } from "../stores/checkers.store.js";
import { awardMatchResult } from "../services/economy.service.js";

/**
 * Flutter emits:
 *  - checkers:join           { matchId, userId }
 *  - checkers:leave          { matchId, userId } (optional)
 *  - checkers:request_state  { matchId, userId }
 *  - checkers:move           { matchId, userId, clientMoveId, from, to, ts }
 *
 * Server emits:
 *  - checkers:state
 *  - checkers:move_applied
 *  - checkers:error
 *  - checkers:player_status   { matchId, userId, status: 'disconnected'|'connected', expiresAt? }
 *  - checkers:match_finished  { matchId, winner, reason }
 */

const GRACE_MS = 60_000;

// socket.id -> { matchId, userId }
const socketSession = new Map();

function safeStr(v) {
  try {
    return v?.toString?.().trim() || "";
  } catch {
    return "";
  }
}

function room(matchId) {
  return `checkers:${matchId}`;
}

function requireSocketUser(socket, payloadUserId) {
  const authedUserId = socket?.data?.user?.userId || null;

  if (!authedUserId) {
    const err = new Error("AUTH_REQUIRED");
    err.code = "AUTH_REQUIRED";
    throw err;
  }

  if (payloadUserId && authedUserId !== payloadUserId) {
    const err = new Error("USER_MISMATCH");
    err.code = "USER_MISMATCH";
    throw err;
  }

  return authedUserId;
}

function disconnectedMapToObject(st) {
  const out = {};
  try {
    const m = st?.disconnected;
    if (!m || typeof m.entries !== "function") return out;

    for (const [uid, info] of m.entries()) {
      out[uid] = info;
    }
  } catch (_) {}
  return out;
}

function emitStateToSocket(socket, matchId, st) {
  socket.emit("checkers:state", {
    matchId,
    state: {
      pieces: st.pieces,
      isPlayerOneTurn: st.isPlayerOneTurn,
      gameEnded: st.gameEnded,
      winner: st.winner,
      playerOneId: st.playerOneId,
      playerTwoId: st.playerTwoId,
      updatedAt: st.updatedAt,
      disconnected: disconnectedMapToObject(st),
    },
  });
}

function emitStateToRoom(io, matchId, st) {
  io.to(room(matchId)).emit("checkers:state", {
    matchId,
    state: {
      pieces: st.pieces,
      isPlayerOneTurn: st.isPlayerOneTurn,
      gameEnded: st.gameEnded,
      winner: st.winner,
      playerOneId: st.playerOneId,
      playerTwoId: st.playerTwoId,
      updatedAt: st.updatedAt,
      disconnected: disconnectedMapToObject(st),
    },
  });
}

async function resolvePlayersFromDb(matchId) {
  try {
    const m = await Match.findOne({ matchId }).select("players").lean();
    if (m?.players?.length >= 2) {
      const p1 = m.players[0]?.userId?.toString?.() || null;
      const p2 = m.players[1]?.userId?.toString?.() || null;
      if (p1 && p2) return { p1, p2 };
    }
  } catch (_) {}
  return { p1: null, p2: null };
}

async function markMatchCompleted({ matchId, winnerId }) {
  try {
    const mid = safeStr(matchId);
    const wid = safeStr(winnerId);
    if (!mid || !wid) return;

    await Match.updateOne(
      { matchId: mid },
      {
        $set: {
          status: "completed",
          winner: wid,
          endedAt: new Date(),
        },
      }
    );
  } catch (e) {
    console.error("Failed to mark Match completed:", e?.message || e);
  }
}

async function awardIfPossible({ matchId, winnerId, reason, st }) {
  try {
    const win = safeStr(winnerId);
    if (!win) return;

    let p1 = safeStr(st?.playerOneId);
    let p2 = safeStr(st?.playerTwoId);

    if (!p1 || !p2) {
      const fromDb = await resolvePlayersFromDb(matchId);
      p1 = p1 || fromDb.p1;
      p2 = p2 || fromDb.p2;
    }

    const loserId = win === p1 ? p2 : win === p2 ? p1 : null;
    if (!loserId) return;

    // ✅ idempotent via PointsLedger unique index
    // ✅ awards POINTS only; coins are claimed later via /api/economy/claim
    await awardMatchResult({
      matchId,
      winnerId: win,
      loserId,
      reason: reason || "normal",
    });
  } catch (e) {
    console.error("Economy award failed:", e?.message || e);
  }
}

export function bindCheckersSockets(io) {
  // cleanup old in-memory states every 5 minutes
  setInterval(() => {
    checkersStore.cleanupOlderThan(1000 * 60 * 60); // 1 hour
  }, 1000 * 60 * 5);

  io.on("connection", (socket) => {
    socket.on("checkers:join", async (payload) => {
      try {
        const matchId = safeStr(payload?.matchId);
        const userIdFromPayload = safeStr(payload?.userId);

        if (!matchId) throw new Error("Missing matchId");
        if (!userIdFromPayload) throw new Error("Missing userId");

        const authedUserId = requireSocketUser(socket, userIdFromPayload);

        socket.join(room(matchId));
        socketSession.set(socket.id, { matchId, userId: authedUserId });

        // Resolve players from DB match (if exists)
        let p1 = null;
        let p2 = null;

        const m = await Match.findOne({ matchId }).select("players").lean();
        if (m?.players?.length >= 2) {
          p1 = m.players[0]?.userId?.toString?.() || null;
          p2 = m.players[1]?.userId?.toString?.() || null;
        }

        const st = checkersStore.ensure(matchId, {
          playerOneId: p1,
          playerTwoId: p2,
          blockersEnabled: false,
        });

        // ✅ If DB match not found, learn players from joiners
        if (!st.playerOneId) {
          st.playerOneId = authedUserId;
        } else if (!st.playerTwoId && st.playerOneId !== authedUserId) {
          st.playerTwoId = authedUserId;
        }

        if (st.playerOneId && st.playerTwoId) {
          if (authedUserId !== st.playerOneId && authedUserId !== st.playerTwoId) {
            const err = new Error("You are not in this match");
            err.code = "NOT_IN_MATCH";
            throw err;
          }
        }

        checkersStore.markConnected(matchId, authedUserId);

        io.to(room(matchId)).emit("checkers:player_status", {
          matchId,
          userId: authedUserId,
          status: "connected",
        });

        emitStateToSocket(socket, matchId, st);
      } catch (err) {
        socket.emit("checkers:error", {
          message: err?.message || "Join failed",
          code: err?.code || "JOIN_FAILED",
        });
      }
    });

    socket.on("checkers:leave", async (payload) => {
      try {
        const matchId = safeStr(payload?.matchId);
        const userIdFromPayload = safeStr(payload?.userId);

        if (!matchId) throw new Error("Missing matchId");
        if (!userIdFromPayload) throw new Error("Missing userId");

        const authedUserId = requireSocketUser(socket, userIdFromPayload);

        socket.leave(room(matchId));

        const sess = socketSession.get(socket.id);
        if (sess?.matchId === matchId) socketSession.delete(socket.id);

        const st = checkersStore.get(matchId);
        if (st && !st.gameEnded) {
          const updated = checkersStore.markDisconnected(
            matchId,
            authedUserId,
            GRACE_MS,
            async ({ matchId: mid, userId }) => {
              const opp = checkersStore.getOpponentId(mid, userId);
              if (!opp) return;

              const finalSt = checkersStore.forfeit(mid, opp);
              if (!finalSt) return;

              io.to(room(mid)).emit("checkers:match_finished", {
                matchId: mid,
                winner: opp,
                reason: "left_match",
              });

              emitStateToRoom(io, mid, finalSt);

              await markMatchCompleted({ matchId: mid, winnerId: opp });
              await awardIfPossible({
                matchId: mid,
                winnerId: opp,
                reason: "left_match",
                st: finalSt,
              });
            }
          );

          const info = updated?.disconnected?.get?.(authedUserId);
          io.to(room(matchId)).emit("checkers:player_status", {
            matchId,
            userId: authedUserId,
            status: "disconnected",
            expiresAt: info?.expiresAt,
          });
        }
      } catch (err) {
        socket.emit("checkers:error", {
          message: err?.message || "Leave failed",
          code: err?.code || "LEAVE_FAILED",
        });
      }
    });

    socket.on("checkers:request_state", async (payload) => {
      try {
        const matchId = safeStr(payload?.matchId);
        const userIdFromPayload = safeStr(payload?.userId);

        if (!matchId) throw new Error("Missing matchId");
        if (!userIdFromPayload) throw new Error("Missing userId");

        requireSocketUser(socket, userIdFromPayload);

        const st = checkersStore.get(matchId);
        if (!st) throw new Error("No state found (join first)");

        emitStateToSocket(socket, matchId, st);
      } catch (err) {
        socket.emit("checkers:error", {
          message: err?.message || "Request state failed",
          code: err?.code || "REQUEST_STATE_FAILED",
        });
      }
    });

    socket.on("checkers:move", async (payload) => {
      try {
        const matchId = safeStr(payload?.matchId);
        const userIdFromPayload = safeStr(payload?.userId);

        if (!matchId) throw new Error("Missing matchId");
        if (!userIdFromPayload) throw new Error("Missing userId");

        const authedUserId = requireSocketUser(socket, userIdFromPayload);

        const st = checkersStore.get(matchId);
        if (!st) throw new Error("No state found (join first)");
        if (st.gameEnded) throw new Error("Match already finished");

        if (st.playerOneId && st.playerTwoId) {
          const isP1 = authedUserId === st.playerOneId;
          const isP2 = authedUserId === st.playerTwoId;
          if (!isP1 && !isP2) {
            const err = new Error("You are not in this match");
            err.code = "NOT_IN_MATCH";
            throw err;
          }

          if (st.isPlayerOneTurn && !isP1) {
            const err = new Error("Not your turn");
            err.code = "NOT_YOUR_TURN";
            throw err;
          }
          if (!st.isPlayerOneTurn && !isP2) {
            const err = new Error("Not your turn");
            err.code = "NOT_YOUR_TURN";
            throw err;
          }
        }

        const applied = checkersStore.applyMove(matchId, {
          matchId,
          userId: authedUserId,
          clientMoveId: payload?.clientMoveId,
          from: payload?.from,
          to: payload?.to,
          ts: payload?.ts,
        });

        if (!applied) throw new Error("Failed to apply move");
        if (applied.error) throw new Error(applied.error);

        const next = applied.state;

        io.to(room(matchId)).emit("checkers:move_applied", {
          matchId,
          applied: {
            clientMoveId: payload?.clientMoveId,
            from: payload?.from,
            to: payload?.to,
            by: authedUserId,
          },
          state: {
            pieces: next.pieces,
            isPlayerOneTurn: next.isPlayerOneTurn,
            gameEnded: next.gameEnded,
            winner: next.winner,
            playerOneId: next.playerOneId,
            playerTwoId: next.playerTwoId,
            updatedAt: next.updatedAt,
            disconnected: disconnectedMapToObject(next),
          },
        });

        if (next.gameEnded && next.winner) {
          io.to(room(matchId)).emit("checkers:match_finished", {
            matchId,
            winner: next.winner,
            reason: "normal",
          });

          await markMatchCompleted({ matchId, winnerId: next.winner });
          await awardIfPossible({
            matchId,
            winnerId: next.winner,
            reason: "normal",
            st: next,
          });
        }
      } catch (err) {
        socket.emit("checkers:error", {
          message: err?.message || "Move failed",
          code: err?.code || "MOVE_FAILED",
        });
      }
    });

    socket.on("disconnect", () => {
      try {
        const sess = socketSession.get(socket.id);
        socketSession.delete(socket.id);
        if (!sess) return;

        const matchId = sess.matchId;
        const userId = sess.userId;
        if (!matchId || !userId) return;

        const st = checkersStore.get(matchId);
        if (!st) return;
        if (st.gameEnded) return;

        const updated = checkersStore.markDisconnected(
          matchId,
          userId,
          GRACE_MS,
          async ({ matchId: mid, userId: uid }) => {
            const opp = checkersStore.getOpponentId(mid, uid);
            if (!opp) return;

            const finalSt = checkersStore.forfeit(mid, opp);
            if (!finalSt) return;

            io.to(room(mid)).emit("checkers:match_finished", {
              matchId: mid,
              winner: opp,
              reason: "opponent_disconnected",
            });

            emitStateToRoom(io, mid, finalSt);

            await markMatchCompleted({ matchId: mid, winnerId: opp });
            await awardIfPossible({
              matchId: mid,
              winnerId: opp,
              reason: "opponent_disconnected",
              st: finalSt,
            });
          }
        );

        const info = updated?.disconnected?.get?.(userId);
        io.to(room(matchId)).emit("checkers:player_status", {
          matchId,
          userId,
          status: "disconnected",
          expiresAt: info?.expiresAt,
        });
      } catch (_) {
        // ignore
      }
    });
  });
}
