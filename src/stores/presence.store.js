// src/stores/presence.store.js

/**
 * Presence store:
 * userId -> { sockets:Set, lastSeenAt:number }
 */
class PresenceStore {
  constructor() {
    this.users = new Map();
  }

  upsert(userId, socketId) {
    const entry = this.users.get(userId) || {
      sockets: new Set(),
      lastSeenAt: Date.now(),
    };

    entry.sockets.add(socketId);
    entry.lastSeenAt = Date.now();
    this.users.set(userId, entry);
  }

  removeSocket(userId, socketId) {
    const entry = this.users.get(userId);
    if (!entry) {
      return { becameOffline: false };
    }

    entry.sockets.delete(socketId);

    if (entry.sockets.size === 0) {
      this.users.delete(userId);
      return { becameOffline: true };
    }

    this.users.set(userId, entry);
    return { becameOffline: false };
  }

  snapshot() {
    return Array.from(this.users.entries()).map(([userId, data]) => ({
      userId,
      lastSeenAt: data.lastSeenAt,
      socketCount: data.sockets.size,
    }));
  }
}

export const presenceStore = new PresenceStore();
