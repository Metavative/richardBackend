// src/sockets/checkers.socket.js
import Match from "../models/Match.js";
import { checkersStore } from "../stores/checkers.store.js";

/**
 * Flutter expects:
 *  - EMIT checkers:join           { matchId, userId }
 *  - EMIT checkers:request_state  { matchId, userId }
 *  - EMIT checkers:move           { matchId, userId, clientMoveId, from, to, isCapture, captured, ... }
 *
 * Server emits:
 *  - checkers:state        (full state)
 *  - checkers:move_applied (move + state)
 *  - checkers:error        (error message)
 */
export function bindCheckersSockets(io) {
  // cleanup old in-memory states every 5 minutes
  setInterval(() => {
    checkersStore.cleanupOlderThan(1000 * 60 * 60); // 1 hour
  }, 1000 * 60 * 5);

  io.on("connection", (socket) => {
    const authedUserId = socket?.data?.user?.userId || null;

    socket.on("checkers:join", async (payload) => {
      try {
        const matchId = payload?.matchId?.toString?.().trim();
        const userId = payload?.userId?.toString?.().trim();

        if (!matchId) throw new Error("Missing matchId");
        if (!userId) throw new Error("Missing userId");

        // If socket is authenticated, enforce userId match
        if (authedUserId && authedUserId !== userId) {
          throw new Error("User mismatch");
        }

        // Join match room
        socket.join(`checkers:${matchId}`);

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
          },
        });
      } catch (err) {
        socket.emit("checkers:error", { message: err?.message || "Join failed" });
      }
    });

    socket.on("checkers:request_state", async (payload) => {
      try {
        const matchId = payload?.matchId?.toString?.().trim();
        if (!matchId) throw new Error("Missing matchId");

        const st = checkersStore.get(matchId);
        if (!st) throw new Error("No state found (join first)");

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
          },
        });
      } catch (err) {
        socket.emit("checkers:error", { message: err?.message || "Request state failed" });
      }
    });

    socket.on("checkers:move", async (payload) => {
      try {
        const matchId = payload?.matchId?.toString?.().trim();
        const userId = payload?.userId?.toString?.().trim();

        if (!matchId) throw new Error("Missing matchId");
        if (!userId) throw new Error("Missing userId");

        if (authedUserId && authedUserId !== userId) {
          throw new Error("User mismatch");
        }

        // Must exist
        const st = checkersStore.get(matchId);
        if (!st) throw new Error("No state found (join first)");

        // Light turn enforcement (only if player ids known)
        if (st.playerOneId && st.playerTwoId) {
          const isP1 = userId === st.playerOneId;
          const isP2 = userId === st.playerTwoId;
          if (!isP1 && !isP2) throw new Error("You are not in this match");

          if (st.isPlayerOneTurn && !isP1) throw new Error("Not your turn");
          if (!st.isPlayerOneTurn && !isP2) throw new Error("Not your turn");
        }

        const applied = checkersStore.applyMove(matchId, payload);
        if (!applied) throw new Error("Failed to apply move");
        if (applied.error) throw new Error(applied.error);

        const next = applied.state;

        // Broadcast to room
        io.to(`checkers:${matchId}`).emit("checkers:move_applied", {
          matchId,
          clientMoveId: payload?.clientMoveId,
          from: payload?.from,
          to: payload?.to,
          isCapture: payload?.isCapture || false,
          captured: payload?.captured || [],
          isPlayerOneTurn: next.isPlayerOneTurn,
          gameEnded: next.gameEnded,
          winner: next.winner,
          state: {
            pieces: next.pieces,
            isPlayerOneTurn: next.isPlayerOneTurn,
            gameEnded: next.gameEnded,
            winner: next.winner,
            playerOneId: next.playerOneId,
            playerTwoId: next.playerTwoId,
            updatedAt: next.updatedAt,
          },
        });
      } catch (err) {
        socket.emit("checkers:error", { message: err?.message || "Move failed" });
      }
    });
  });
}
