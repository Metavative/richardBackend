// src/stores/presence.store.js

/**
 * In-memory presence store (single-instance).
 *
 * If you scale to multiple Node processes/instances, swap this for Redis.
 */

/**
 * @typedef {"available"|"away"|"busy"|"in_game"} PresenceStatus
 */

/**
 * @typedef PresenceUser
 * @property {string} userId
 * @property {PresenceStatus} status
 * @property {number} lastSeenAt
 * @property {Set<string>} sockets
 * @property {object|undefined} profile
 */

/** @type {Map<string, PresenceUser>} */
const users = new Map();

function now() {
  return Date.now();
}

export function markOnline({ userId, socketId, profile }) {
  const existing = users.get(userId);
  if (existing) {
    existing.sockets.add(socketId);
    existing.lastSeenAt = now();
    if (profile) existing.profile = profile;
    // Don't change status automatically
    return existing;
  }

  const u = {
    userId,
    status: "available",
    lastSeenAt: now(),
    sockets: new Set([socketId]),
    profile: profile || undefined,
  };
  users.set(userId, u);
  return u;
}

export function markOffline({ socketId }) {
  let removedUser = null;

  for (const [userId, u] of users.entries()) {
    if (!u.sockets.has(socketId)) continue;

    u.sockets.delete(socketId);
    u.lastSeenAt = now();

    if (u.sockets.size === 0) {
      users.delete(userId);
      removedUser = u;
    }

    break;
  }

  return removedUser; // null if nothing removed fully
}

export function setStatus({ userId, status }) {
  const u = users.get(userId);
  if (!u) return null;
  u.status = status;
  u.lastSeenAt = now();
  return u;
}

export function upsertProfile({ userId, profile }) {
  const u = users.get(userId);
  if (!u) return null;
  u.profile = profile;
  u.lastSeenAt = now();
  return u;
}

export function isOnline(userId) {
  return users.has(userId);
}

export function snapshot() {
  // Convert to a safe JSON serializable shape
  return Array.from(users.values()).map((u) => ({
    userId: u.userId,
    status: u.status,
    lastSeenAt: u.lastSeenAt,
    profile: u.profile,
  }));
}

export function getUser(userId) {
  return users.get(userId) || null;
}
