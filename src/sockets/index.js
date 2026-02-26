// src/sockets/index.js
import { socketAuth } from "./socketAuth.js";
import { bindPresenceSockets } from "./presence.socket.js";
import { bindChallengeSockets } from "./challenge.socket.js";
import { bindCheckersSockets } from "./checkers.socket.js";
import { bindFriendsSockets } from "./friends.socket.js"; // ✅ NEW

export function initSockets(io, { matchmakingService } = {}) {
  // 1) Auth middleware for sockets (aligned with REST token verification)
  io.use(socketAuth());

  // 2) Bind socket modules
  bindPresenceSockets(io);
  bindChallengeSockets(io, { matchmakingService });
  bindCheckersSockets(io);
  bindFriendsSockets(io); // ✅ NEW

  console.log("✅ Sockets initialized: presence + challenges + checkers + friends");
}