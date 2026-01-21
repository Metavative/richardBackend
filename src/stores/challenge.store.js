// src/stores/challenge.store.js
import crypto from "crypto";

/**
 * In-memory challenges:
 * challengeId -> {
 *   id, fromUserId, toUserId, status, createdAt, expiresAt
 * }
 *
 * status: "pending" | "accepted" | "declined" | "cancelled"
 */
class ChallengeStore {
  constructor() {
    this.map = new Map();
    this.ttlMs = Number(process.env.CHALLENGE_TTL_MS) || 2 * 60 * 1000;

    // Cleanup expired challenges every minute (unref so it won't keep process alive)
    const interval = setInterval(() => this.cleanup(), 60 * 1000);
    interval.unref?.();
  }

  create({ fromUserId, toUserId }) {
    const id = crypto.randomBytes(10).toString("hex");
    const now = Date.now();

    const challenge = {
      id,
      fromUserId,
      toUserId,
      status: "pending",
      createdAt: now,
      expiresAt: now + this.ttlMs,
    };

    this.map.set(id, challenge);
    return challenge;
  }

  get(id) {
    const c = this.map.get(id) || null;
    if (!c) return null;

    if (c.expiresAt && c.expiresAt < Date.now()) {
      this.map.delete(id);
      return null;
    }

    return c;
  }

  updateStatus(id, status) {
    const c = this.get(id);
    if (!c) return null;

    c.status = status;
    this.map.set(id, c);
    return c;
  }

  delete(id) {
    this.map.delete(id);
  }

  cleanup() {
    const now = Date.now();
    for (const [id, c] of this.map.entries()) {
      if (c?.expiresAt && c.expiresAt < now) {
        this.map.delete(id);
      }
    }
  }
}

export const challengeStore = new ChallengeStore();
