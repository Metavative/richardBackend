// src/sockets/presence.socket.js
import User from "../models/User.js";
import {
  markOnline,
  markOffline,
  setStatus,
  snapshot,
  upsertProfile,
} from "../stores/presence.store.js";

// Event names (client-facing)
export const PresenceEvents = {
  subscribe: "presence:subscribe",
  setStatus: "presence:set_status",

  onlineList: "presence:online_list",
  update: "presence:update",
  error: "presence:error",
};

function log(msg, ...args) {
  console.log(`[presence] ${msg}`, ...args);
}

function safeProfileFromUser(user) {
  if (!user) return undefined;
  return {
    id: user._id?.toString?.() || undefined,
    name: user.name || undefined,
    email: user.email || undefined,
    avatarUrl: user.profile_picture?.url || undefined,
  };
}

async function loadProfile(userId) {
  try {
    const user = await User.findById(userId).select("name email profile_picture.url");
    return safeProfileFromUser(user);
  } catch {
    return undefined;
  }
}

function ensureAuthed(socket) {
  const uid = socket.userId ? String(socket.userId).trim() : "";
  return uid.length ? uid : null;
}

/**
 * Step 1: presence (online players)
 */
export function registerPresenceSockets(io) {
  io.on("connection", (socket) => {
    const uid = ensureAuthed(socket);

    // If authenticated, mark online immediately.
    if (uid) {
      socket.join(`user:${uid}`);
      markOnline({ userId: uid, socketId: socket.id });
      io.emit(PresenceEvents.update, {
        type: "online",
        userId: uid,
        ts: Date.now(),
      });
    }

    socket.on(PresenceEvents.subscribe, async () => {
      const userId = ensureAuthed(socket);
      if (!userId) {
        socket.emit(PresenceEvents.error, {
          code: "UNAUTHENTICATED",
          message: "Missing/invalid socket token",
          ts: Date.now(),
        });
        return;
      }

      // Ensure online record exists (in case auth attached after connection)
      markOnline({ userId, socketId: socket.id });
      socket.join(`user:${userId}`);

      // Load profile once to make the list useful
      const profile = await loadProfile(userId);
      if (profile) upsertProfile({ userId, profile });

      socket.emit(PresenceEvents.onlineList, {
        users: snapshot(),
        ts: Date.now(),
      });

      // Broadcast a richer update for this user (includes profile/status)
      io.emit(PresenceEvents.update, {
        type: "online",
        userId,
        status: "available",
        profile: profile || undefined,
        ts: Date.now(),
      });

      log(`subscribe: ${userId} (${socket.id})`);
    });

    socket.on(PresenceEvents.setStatus, (payload) => {
      const userId = ensureAuthed(socket);
      if (!userId) {
        socket.emit(PresenceEvents.error, {
          code: "UNAUTHENTICATED",
          message: "Missing/invalid socket token",
          ts: Date.now(),
        });
        return;
      }

      const status = String(payload?.status || "").trim();
      const allowed = new Set(["available", "away", "busy", "in_game"]);
      if (!allowed.has(status)) {
        socket.emit(PresenceEvents.error, {
          code: "BAD_STATUS",
          message: "Invalid status",
          ts: Date.now(),
        });
        return;
      }

      const updated = setStatus({ userId, status });
      if (!updated) {
        // Re-create if missing
        markOnline({ userId, socketId: socket.id });
        setStatus({ userId, status });
      }

      io.emit(PresenceEvents.update, {
        type: "status",
        userId,
        status,
        ts: Date.now(),
      });
    });

    socket.on("disconnect", () => {
      const removed = markOffline({ socketId: socket.id });
      if (removed?.userId) {
        io.emit(PresenceEvents.update, {
          type: "offline",
          userId: removed.userId,
          ts: Date.now(),
        });
      }
    });
  });
}
