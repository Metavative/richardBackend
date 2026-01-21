// src/stores/challenge.store.js

/**
 * In-memory challenges store (single instance).
 * If you scale to multi-instances later, move this to Redis or Mongo with TTL.
 */

function now() {
    return Date.now();
  }
  
  function makeId() {
    return `ch_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
  
  /**
   * @typedef {"pending"|"accepted"|"declined"|"cancelled"|"expired"} ChallengeStatus
   */
  
  /**
   * @typedef Challenge
   * @property {string} challengeId
   * @property {string} fromUserId
   * @property {string} toUserId
   * @property {string} game
   * @property {ChallengeStatus} status
   * @property {number} createdAt
   * @property {number} expiresAt
   * @property {object} meta
   */
  
  const challengesById = new Map(); // challengeId -> Challenge
  
  // Prevent spam: one active pending per pair+game
  const pendingKeyIndex = new Map(); // `${from}:${to}:${game}` -> challengeId
  
  export function createChallenge({
    fromUserId,
    toUserId,
    game = "checkers",
    ttlMs = 45000,
    meta = {},
  }) {
    const k = `${fromUserId}:${toUserId}:${game}`;
    const existingId = pendingKeyIndex.get(k);
    if (existingId) {
      const existing = challengesById.get(existingId);
      if (existing && existing.status === "pending" && existing.expiresAt > now()) {
        return { challenge: existing, reused: true };
      }
      pendingKeyIndex.delete(k);
    }
  
    const challengeId = makeId();
    const createdAt = now();
    const expiresAt = createdAt + ttlMs;
  
    const ch = {
      challengeId,
      fromUserId,
      toUserId,
      game,
      status: "pending",
      createdAt,
      expiresAt,
      meta,
    };
  
    challengesById.set(challengeId, ch);
    pendingKeyIndex.set(k, challengeId);
  
    return { challenge: ch, reused: false };
  }
  
  export function getChallenge(challengeId) {
    return challengesById.get(challengeId) || null;
  }
  
  export function updateChallengeStatus(challengeId, status) {
    const ch = challengesById.get(challengeId);
    if (!ch) return null;
  
    ch.status = status;
  
    // Clean pending index if leaving pending
    if (status !== "pending") {
      const k = `${ch.fromUserId}:${ch.toUserId}:${ch.game}`;
      if (pendingKeyIndex.get(k) === challengeId) pendingKeyIndex.delete(k);
    }
  
    return ch;
  }
  
  export function cancelChallenge(challengeId) {
    return updateChallengeStatus(challengeId, "cancelled");
  }
  
  export function expireChallenge(challengeId) {
    return updateChallengeStatus(challengeId, "expired");
  }
  
  export function sweepExpired() {
    const t = now();
    const expired = [];
  
    for (const [id, ch] of challengesById.entries()) {
      if (ch.status === "pending" && ch.expiresAt <= t) {
        ch.status = "expired";
        expired.push(ch);
  
        const k = `${ch.fromUserId}:${ch.toUserId}:${ch.game}`;
        if (pendingKeyIndex.get(k) === id) pendingKeyIndex.delete(k);
      }
    }
  
    return expired;
  }
  