// src/stores/checkers.store.js

/**
 * In-memory checkers states:
 * matchId -> {
 *   matchId,
 *   playerOneId,
 *   playerTwoId,
 *   pieces: 8x8 (strings/null),
 *   isPlayerOneTurn: boolean,
 *   gameEnded: boolean,
 *   winner: string|null,
 *   updatedAt: number,
 *   seenMoveIds: Set<string>
 * }
 */

function createInitialBoard({ blockersEnabled = false } = {}) {
    if (blockersEnabled) {
      return [
        ["s", "s", "t", "w", "w", "t", "s", "s"],
        ["d", "d", "b", "d", "d", "b", "d", "d"],
        Array(8).fill(null),
        Array(8).fill(null),
        Array(8).fill(null),
        Array(8).fill(null),
        ["D", "D", "B", "D", "D", "B", "D", "D"],
        ["S", "S", "T", "W", "W", "T", "S", "S"],
      ];
    }
  
    return [
      ["s", "s", "t", "w", "w", "t", "s", "s"],
      ["d", "d", "d", "d", "d", "d", "d", "d"],
      Array(8).fill(null),
      Array(8).fill(null),
      Array(8).fill(null),
      Array(8).fill(null),
      ["D", "D", "D", "D", "D", "D", "D", "D"],
      ["S", "S", "T", "W", "W", "T", "S", "S"],
    ];
  }
  
  class CheckersStore {
    constructor() {
      this.map = new Map();
    }
  
    get(matchId) {
      return this.map.get(matchId) || null;
    }
  
    upsert(state) {
      this.map.set(state.matchId, state);
      return state;
    }
  
    ensure(matchId, { playerOneId, playerTwoId, blockersEnabled = false } = {}) {
      const existing = this.get(matchId);
      if (existing) return existing;
  
      const st = {
        matchId,
        playerOneId,
        playerTwoId,
        pieces: createInitialBoard({ blockersEnabled }),
        isPlayerOneTurn: true,
        gameEnded: false,
        winner: null,
        updatedAt: Date.now(),
        seenMoveIds: new Set(),
      };
  
      this.upsert(st);
      return st;
    }
  
    applyMove(matchId, movePayload) {
      const st = this.get(matchId);
      if (!st) return null;
  
      const clientMoveId = movePayload?.clientMoveId?.toString?.() || null;
      if (clientMoveId && st.seenMoveIds.has(clientMoveId)) {
        return { state: st, deduped: true };
      }
      if (clientMoveId) st.seenMoveIds.add(clientMoveId);
  
      // ✅ If client includes a full board snapshot, accept it (keeps logic identical to Flutter)
      if (Array.isArray(movePayload?.pieces)) {
        st.pieces = movePayload.pieces;
      } else if (movePayload?.from && movePayload?.to) {
        // Minimal fallback apply (no deep validation)
        const fr = movePayload.from.row;
        const fc = movePayload.from.col;
        const tr = movePayload.to.row;
        const tc = movePayload.to.col;
  
        const piece = st.pieces?.[fr]?.[fc] ?? null;
        if (piece == null) return { state: st, error: "No piece at from" };
  
        // move piece
        st.pieces[fr][fc] = null;
        st.pieces[tr][tc] = piece;
  
        // captured removal
        const captured = Array.isArray(movePayload.captured) ? movePayload.captured : [];
        for (const p of captured) {
          const rr = p?.row;
          const cc = p?.col;
          if (typeof rr === "number" && typeof cc === "number") {
            st.pieces[rr][cc] = null;
          }
        }
      }
  
      // Turn update
      if (typeof movePayload?.isPlayerOneTurn === "boolean") {
        st.isPlayerOneTurn = movePayload.isPlayerOneTurn;
      } else {
        st.isPlayerOneTurn = !st.isPlayerOneTurn;
      }
  
      if (typeof movePayload?.gameEnded === "boolean") st.gameEnded = movePayload.gameEnded;
      if (movePayload?.winner != null) st.winner = movePayload.winner?.toString?.() ?? null;
  
      st.updatedAt = Date.now();
      return { state: st, deduped: false };
    }
  
    cleanupOlderThan(ms) {
      const now = Date.now();
      for (const [matchId, st] of this.map.entries()) {
        if (!st?.updatedAt) continue;
        if (now - st.updatedAt > ms) this.map.delete(matchId);
      }
    }
  }
  
  export const checkersStore = new CheckersStore();
  