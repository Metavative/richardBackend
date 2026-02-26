// src/sockets/friends.socket.js

/**
 * Friends socket module
 * - Joins a per-user room so REST can emit events:
 *   room: user:<userId>
 * - Uses socketAuth's attachment:
 *   socket.data.user = { userId, role, email }
 */
export function bindFriendsSockets(io) {
  io.on("connection", (socket) => {
    const userId = socket.data?.user?.userId;

    // Auto-join user room if authenticated
    if (userId) {
      socket.join(`user:${userId}`);
    }

    // Optional explicit join (useful after reconnects)
    socket.on("friends:join", () => {
      const uid = socket.data?.user?.userId;
      if (uid) socket.join(`user:${uid}`);
    });
  });

  console.log("✅ Friends sockets bound");
}