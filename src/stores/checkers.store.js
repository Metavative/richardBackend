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
 *   seenMoveIds: Set<string>,
 *
 *   // Step 2 additions:
 *   disconnected: Map<userId, { at: number, expiresAt: number }>,
 *   disconnectTimers: Map<userId, NodeJS.Timeout>,
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
    if (existing) {
      // If we learn player ids later, hydrate them
      if (!existing.playerOneId && playerOneId) existing.playerOneId = playerOneId;
      if (!existing.playerTwoId && playerTwoId) existing.playerTwoId = playerTwoId;
      return existing;
    }

    const st = {
      matchId,
      playerOneId: playerOneId || null,
      playerTwoId: playerTwoId || null,
      pieces: createInitialBoard({ blockersEnabled }),
      isPlayerOneTurn: true,
      gameEnded: false,
      winner: null,
      updatedAt: Date.now(),
      seenMoveIds: new Set(),

      // Step 2
      disconnected: new Map(),
      disconnectTimers: new Map(),
    };

    this.upsert(st);
    return st;
  }

  /** Resolve opponent id if known */
  getOpponentId(matchId, userId) {
    const st = this.get(matchId);
    if (!st) return null;
    const u = userId?.toString?.() || null;
    if (!u) return null;

    if (st.playerOneId && st.playerTwoId) {
      if (u === st.playerOneId) return st.playerTwoId;
      if (u === st.playerTwoId) return st.playerOneId;
    }
    return null;
  }

  /** Mark disconnected and start/refresh grace timer */
  markDisconnected(matchId, userId, graceMs, onExpire) {
    const st = this.get(matchId);
    if (!st) return null;
    if (st.gameEnded) return st;

    const uid = userId?.toString?.() || null;
    if (!uid) return st;

    const now = Date.now();
    const expiresAt = now + graceMs;

    // Clear any existing timer
    const prevTimer = st.disconnectTimers.get(uid);
    if (prevTimer) {
      try {
        clearTimeout(prevTimer);
      } catch (_) {}
      st.disconnectTimers.delete(uid);
    }

    st.disconnected.set(uid, { at: now, expiresAt });

    const t = setTimeout(() => {
      try {
        // Ensure still disconnected at expiry moment
        const info = st.disconnected.get(uid);
        if (!info) return;

        // If match already ended, stop
        if (st.gameEnded) return;

        // expire callback decides forfeit
        onExpire?.({ matchId, userId: uid });
      } catch (_) {}
    }, graceMs);

    st.disconnectTimers.set(uid, t);

    st.updatedAt = Date.now();
    return st;
  }

  /** Mark connected and cancel timer */
  markConnected(matchId, userId) {
    const st = this.get(matchId);
    if (!st) return null;

    const uid = userId?.toString?.() || null;
    if (!uid) return st;

    const prevTimer = st.disconnectTimers.get(uid);
    if (prevTimer) {
      try {
        clearTimeout(prevTimer);
      } catch (_) {}
      st.disconnectTimers.delete(uid);
    }

    st.disconnected.delete(uid);
    st.updatedAt = Date.now();
    return st;
  }

  /** End match by forfeit */
  forfeit(matchId, winnerUserId) {
    const st = this.get(matchId);
    if (!st) return null;
    if (st.gameEnded) return st;

    st.gameEnded = true;
    st.winner = winnerUserId?.toString?.() || null;
    st.updatedAt = Date.now();

    // clear all timers
    for (const [, timer] of st.disconnectTimers.entries()) {
      try {
        clearTimeout(timer);
      } catch (_) {}
    }
    st.disconnectTimers.clear();
    st.disconnected.clear();

    return st;
  }

  applyMove(matchId, movePayload) {
    const st = this.get(matchId);
    if (!st) return null;
    if (st.gameEnded) return { state: st, error: "Match already ended" };

    const clientMoveId = movePayload?.clientMoveId?.toString?.() || null;
    if (clientMoveId && st.seenMoveIds.has(clientMoveId)) {
      return { state: st, deduped: true };
    }
    if (clientMoveId) st.seenMoveIds.add(clientMoveId);

    // ✅ Server authority note:
    // For Step 2 we keep your existing apply behavior.
    // (If you've upgraded store to strict validation elsewhere, keep that.)
    if (Array.isArray(movePayload?.pieces)) {
      st.pieces = movePayload.pieces;
    } else if (movePayload?.from && movePayload?.to) {
      const fr = movePayload.from.row;
      const fc = movePayload.from.col;
      const tr = movePayload.to.row;
      const tc = movePayload.to.col;

      const piece = st.pieces?.[fr]?.[fc] ?? null;
      if (piece == null) return { state: st, error: "No piece at from" };

      st.pieces[fr][fc] = null;
      st.pieces[tr][tc] = piece;

      const captured = Array.isArray(movePayload.captured) ? movePayload.captured : [];
      for (const p of captured) {
        const rr = p?.row;
        const cc = p?.col;
        if (typeof rr === "number" && typeof cc === "number") {
          st.pieces[rr][cc] = null;
        }
      }
    }

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
      if (now - st.updatedAt > ms) {
        // clear timers before deletion
        try {
          for (const [, timer] of st.disconnectTimers?.entries?.() || []) {
            try {
              clearTimeout(timer);
            } catch (_) {}
          }
        } catch (_) {}
        this.map.delete(matchId);
      }
    }
  }
}

export const checkersStore = new CheckersStore();
