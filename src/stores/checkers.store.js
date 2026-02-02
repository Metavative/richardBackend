// src/stores/checkers.store.js

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

// lowercase => player one, uppercase => player two
function countSides(pieces) {
  let p1 = 0;
  let p2 = 0;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const v = pieces?.[r]?.[c];
      if (!v) continue;
      if (typeof v !== "string") continue;

      // only letters count as pieces
      const ch = v[0];
      if (ch >= "a" && ch <= "z") p1++;
      else if (ch >= "A" && ch <= "Z") p2++;
    }
  }

  return { p1, p2 };
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

      disconnected: new Map(),
      disconnectTimers: new Map(),
    };

    this.upsert(st);
    return st;
  }

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

  markDisconnected(matchId, userId, graceMs, onExpire) {
    const st = this.get(matchId);
    if (!st) return null;
    if (st.gameEnded) return st;

    const uid = userId?.toString?.() || null;
    if (!uid) return st;

    const now = Date.now();
    const expiresAt = now + graceMs;

    const prevTimer = st.disconnectTimers.get(uid);
    if (prevTimer) {
      try { clearTimeout(prevTimer); } catch (_) {}
      st.disconnectTimers.delete(uid);
    }

    st.disconnected.set(uid, { at: now, expiresAt });

    const t = setTimeout(() => {
      try {
        const info = st.disconnected.get(uid);
        if (!info) return;
        if (st.gameEnded) return;
        onExpire?.({ matchId, userId: uid });
      } catch (_) {}
    }, graceMs);

    st.disconnectTimers.set(uid, t);

    st.updatedAt = Date.now();
    return st;
  }

  markConnected(matchId, userId) {
    const st = this.get(matchId);
    if (!st) return null;

    const uid = userId?.toString?.() || null;
    if (!uid) return st;

    const prevTimer = st.disconnectTimers.get(uid);
    if (prevTimer) {
      try { clearTimeout(prevTimer); } catch (_) {}
      st.disconnectTimers.delete(uid);
    }

    st.disconnected.delete(uid);
    st.updatedAt = Date.now();
    return st;
  }

  forfeit(matchId, winnerUserId) {
    const st = this.get(matchId);
    if (!st) return null;
    if (st.gameEnded) return st;

    st.gameEnded = true;
    st.winner = winnerUserId?.toString?.() || null;
    st.updatedAt = Date.now();

    for (const [, timer] of st.disconnectTimers.entries()) {
      try { clearTimeout(timer); } catch (_) {}
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

    // Apply move (simple)
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

    // Turn
    if (typeof movePayload?.isPlayerOneTurn === "boolean") {
      st.isPlayerOneTurn = movePayload.isPlayerOneTurn;
    } else {
      st.isPlayerOneTurn = !st.isPlayerOneTurn;
    }

    // ✅ Server decides win if not explicitly provided
    const { p1, p2 } = countSides(st.pieces);

    if (p1 === 0 || p2 === 0) {
      st.gameEnded = true;

      // If player ids are known, set winner id
      if (st.playerOneId && st.playerTwoId) {
        st.winner = p1 === 0 ? st.playerTwoId : st.playerOneId;
      } else {
        // fallback: keep winner null (socket layer will still emit match_finished but reward needs ids)
        st.winner = st.winner || null;
      }
    }

    // If client explicitly sent end/winner, allow it (but server win detection already covers most cases)
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
        try {
          for (const [, timer] of st.disconnectTimers?.entries?.() || []) {
            try { clearTimeout(timer); } catch (_) {}
          }
        } catch (_) {}
        this.map.delete(matchId);
      }
    }
  }
}

export const checkersStore = new CheckersStore();
