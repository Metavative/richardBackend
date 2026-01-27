// src/sockets/checkers.socket.js
import Match from "../models/Match.js";
import { checkersStore } from "../stores/checkers.store.js";

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

  // ✅ market-ready: online checkers requires auth
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
  // st.disconnected is a Map<userId, { at, expiresAt }>
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

        // Join match room
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

        // Create or get state
        const st = checkersStore.ensure(matchId, {
          playerOneId: p1,
          playerTwoId: p2,
          blockersEnabled: false,
        });

        // If players are known, ensure joiner is part of match
        if (st.playerOneId && st.playerTwoId) {
          if (authedUserId !== st.playerOneId && authedUserId !== st.playerTwoId) {
            const err = new Error("You are not in this match");
            err.code = "NOT_IN_MATCH";
            throw err;
          }
        }

        // ✅ reconnect handling: mark connected + cancel grace timer
        checkersStore.markConnected(matchId, authedUserId);

        io.to(room(matchId)).emit("checkers:player_status", {
          matchId,
          userId: authedUserId,
          status: "connected",
        });

        // send state to joiner
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

        // remove session for this socket
        const sess = socketSession.get(socket.id);
        if (sess?.matchId === matchId) socketSession.delete(socket.id);

        // Optional: treat leave as disconnect (start grace)
        const st = checkersStore.get(matchId);
        if (st && !st.gameEnded) {
          const updated = checkersStore.markDisconnected(
            matchId,
            authedUserId,
            GRACE_MS,
            ({ matchId: mid, userId }) => {
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

        // Light turn enforcement (only if player ids known)
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

        // ✅ move intent only — store decides what happens (you upgraded this already)
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

        // If ended, broadcast match_finished too (Flutter listens to it)
        if (next.gameEnded && next.winner) {
          io.to(room(matchId)).emit("checkers:match_finished", {
            matchId,
            winner: next.winner,
            reason: "normal",
          });
        }
      } catch (err) {
        socket.emit("checkers:error", {
          message: err?.message || "Move failed",
          code: err?.code || "MOVE_FAILED",
        });
      }
    });

    // ✅ Phase 1 Step 2: disconnect grace -> forfeit
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

        // Start grace timer inside store
        const updated = checkersStore.markDisconnected(
          matchId,
          userId,
          GRACE_MS,
          ({ matchId: mid, userId: uid }) => {
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
        // ignore disconnect errors
      }
    });
  });
}
